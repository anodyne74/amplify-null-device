import { Duration } from 'aws-cdk-lib';
import { Topic } from 'aws-cdk-lib/aws-sns';
import { EmailSubscription } from 'aws-cdk-lib/aws-sns-subscriptions';
import {
  Alarm,
  ComparisonOperator,
  Dashboard,
  GraphWidget,
  type IWidget,
  LogQueryVisualizationType,
  LogQueryWidget,
  MathExpression,
  Metric,
  TreatMissingData,
} from 'aws-cdk-lib/aws-cloudwatch';
import { SnsAction } from 'aws-cdk-lib/aws-cloudwatch-actions';
import { FilterPattern, LogGroup, MetricFilter, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Rule } from 'aws-cdk-lib/aws-events';
import { CloudWatchLogGroup } from 'aws-cdk-lib/aws-events-targets';
import type { Backend } from '@aws-amplify/backend';
import type { auth } from '../auth/resource';
import type { data } from '../data/resource';
import type { customerAccessActivation } from '../functions/customer-access-activation/resource';

/**
 * Only the slice of the backend this module touches -- `Backend<T>` is
 * structurally typed, so the real backend (which also has `storage`) still
 * satisfies this.
 */
type ObservabilityBackend = Backend<{
  auth: typeof auth;
  data: typeof data;
  customerAccessActivation: typeof customerAccessActivation;
}>;

const DYNAMO_TABLES_TO_WATCH = ['Route', 'Stop', 'Invoice', 'CustomerUser', 'AuditLog'];

/**
 * Phase 1 observability: a dashboard + a handful of threshold alarms built
 * entirely from signal that already exists today (CloudTrail, native
 * Cognito/AppSync/AmplifyHosting/Lambda/DynamoDB metrics, and Amplify's own
 * deployment-status EventBridge events) -- no new application code, no new
 * Lambdas. See the plan this was built from for the full rationale on what's
 * deferred to a later phase (route/stop business metrics, an AuditLog-based
 * anomaly signal, WAF, anomaly-detection bands, severity tiers).
 */
export function configureObservability(backend: ObservabilityBackend, branchName: string) {
  const stack = backend.createStack('observability');

  // ── Alerting topic ──────────────────────────────────────────────────────
  const alertsTopic = new Topic(stack, 'OpsAlertsTopic', {
    topicName: `nulldevice-ops-alerts-${branchName}`,
  });
  alertsTopic.addSubscription(new EmailSubscription('david.okeeffe@outlook.com.au'));
  const alertAction = new SnsAction(alertsTopic);

  const userPoolId = backend.auth.resources.userPool.userPoolId;
  const apiId = backend.data.resources.graphqlApi.apiId;
  const appId = process.env.AMPLIFY_APP_ID;
  const cloudTrailLogGroupName = process.env.CLOUDTRAIL_LOG_GROUP_NAME;

  const dashboardWidgets: IWidget[][] = [];

  // ── Deployment status/history ────────────────────────────────────────────
  // Amplify's own build-notification SNS topic already emails on build events;
  // this is a separate, repo-owned view (dashboard + our own alarm) rather
  // than a replacement for it.
  if (appId) {
    const deploymentLogGroup = new LogGroup(stack, 'DeploymentEventsLogGroup', {
      logGroupName: `/nulldevice/amplify-deployments-${branchName}`,
      retention: RetentionDays.SIX_MONTHS,
    });

    new Rule(stack, 'DeploymentEventsRule', {
      eventPattern: {
        source: ['aws.amplify'],
        detailType: ['Amplify Deployment Status Change'],
        detail: { appId: [appId] },
      },
      targets: [new CloudWatchLogGroup(deploymentLogGroup)],
    });

    const deploymentFailuresMetric = new MetricFilter(stack, 'DeploymentFailuresFilter', {
      logGroup: deploymentLogGroup,
      filterPattern: FilterPattern.stringValue('$.detail.jobStatus', '=', 'FAILED'),
      metricNamespace: 'NullDeviceOps',
      metricName: 'DeploymentFailures',
      metricValue: '1',
      defaultValue: 0,
    }).metric({ statistic: 'Sum', period: Duration.minutes(5) });

    new Alarm(stack, 'DeploymentFailuresAlarm', {
      alarmName: `nulldevice-deployment-failures-${branchName}`,
      metric: deploymentFailuresMetric,
      threshold: 0,
      evaluationPeriods: 1,
      comparisonOperator: ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: TreatMissingData.NOT_BREACHING,
    }).addAlarmAction(alertAction);

    dashboardWidgets.push([
      new GraphWidget({
        title: 'Deployment failures',
        left: [deploymentFailuresMetric],
        width: 12,
      }),
      new LogQueryWidget({
        title: 'Recent deployments',
        logGroupNames: [deploymentLogGroup.logGroupName],
        view: LogQueryVisualizationType.TABLE,
        queryLines: [
          'fields @timestamp, detail.jobId, detail.jobStatus, detail.branchName',
          'sort @timestamp desc',
          'limit 20',
        ],
        width: 12,
      }),
    ]);
  } else {
    console.warn(
      'configureObservability: AMPLIFY_APP_ID is not set -- skipping the deployment-status dashboard/alarm.',
    );
  }

  // ── User activity ─────────────────────────────────────────────────────
  let loginFailuresMetric: Metric | undefined;
  let loginAttemptsMetric: Metric | undefined;
  let invitationsSentMetric: Metric | undefined;
  let roleChangesMetric: Metric | undefined;

  if (cloudTrailLogGroupName) {
    const cloudTrailLogGroup = LogGroup.fromLogGroupName(stack, 'CloudTrailLogGroup', cloudTrailLogGroupName);

    loginAttemptsMetric = new MetricFilter(stack, 'LoginAttemptsFilter', {
      logGroup: cloudTrailLogGroup,
      filterPattern: FilterPattern.any(
        FilterPattern.stringValue('$.eventName', '=', 'InitiateAuth'),
        FilterPattern.stringValue('$.eventName', '=', 'RespondToAuthChallenge'),
      ),
      metricNamespace: 'NullDeviceOps',
      metricName: 'LoginAttempts',
      metricValue: '1',
      defaultValue: 0,
    }).metric({ statistic: 'Sum', period: Duration.minutes(5) });

    loginFailuresMetric = new MetricFilter(stack, 'LoginFailuresFilter', {
      logGroup: cloudTrailLogGroup,
      filterPattern: FilterPattern.all(
        FilterPattern.any(
          FilterPattern.stringValue('$.eventName', '=', 'InitiateAuth'),
          FilterPattern.stringValue('$.eventName', '=', 'RespondToAuthChallenge'),
        ),
        FilterPattern.exists('$.errorCode'),
      ),
      metricNamespace: 'NullDeviceOps',
      metricName: 'LoginFailures',
      metricValue: '1',
      defaultValue: 0,
    }).metric({ statistic: 'Sum', period: Duration.minutes(5) });

    invitationsSentMetric = new MetricFilter(stack, 'InvitationsSentFilter', {
      logGroup: cloudTrailLogGroup,
      filterPattern: FilterPattern.stringValue('$.eventName', '=', 'AdminCreateUser'),
      metricNamespace: 'NullDeviceOps',
      metricName: 'InvitationsSent',
      metricValue: '1',
      defaultValue: 0,
    }).metric({ statistic: 'Sum', period: Duration.minutes(5) });

    roleChangesMetric = new MetricFilter(stack, 'RoleChangesFilter', {
      logGroup: cloudTrailLogGroup,
      filterPattern: FilterPattern.any(
        FilterPattern.stringValue('$.eventName', '=', 'AdminAddUserToGroup'),
        FilterPattern.stringValue('$.eventName', '=', 'AdminRemoveUserFromGroup'),
      ),
      metricNamespace: 'NullDeviceOps',
      metricName: 'RoleChanges',
      metricValue: '1',
      defaultValue: 0,
    }).metric({ statistic: 'Sum', period: Duration.minutes(5) });

    new Alarm(stack, 'LoginFailuresAlarm', {
      alarmName: `nulldevice-login-failures-${branchName}`,
      metric: loginFailuresMetric,
      threshold: 10,
      evaluationPeriods: 1,
      comparisonOperator: ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: TreatMissingData.NOT_BREACHING,
    }).addAlarmAction(alertAction);
  } else {
    console.warn(
      'configureObservability: CLOUDTRAIL_LOG_GROUP_NAME is not set -- skipping login/invitation/role-change metric filters.',
    );
  }

  const cognitoMetric = (metricName: string) =>
    new Metric({
      namespace: 'AWS/Cognito',
      metricName,
      dimensionsMap: { UserPool: userPoolId },
      statistic: 'Sum',
      period: Duration.minutes(5),
    });

  dashboardWidgets.push([
    new GraphWidget({
      title: 'Sign-ins / sign-ups',
      left: [cognitoMetric('SignInSuccesses'), cognitoMetric('SignUpSuccesses')],
      width: 12,
    }),
    new GraphWidget({
      title: 'Login attempts / failures (CloudTrail)',
      left: [loginAttemptsMetric, loginFailuresMetric].filter((m): m is Metric => Boolean(m)),
      width: 12,
    }),
  ]);

  dashboardWidgets.push([
    new GraphWidget({
      title: 'Account activity (CloudTrail)',
      left: [invitationsSentMetric, roleChangesMetric].filter((m): m is Metric => Boolean(m)),
      width: 12,
    }),
    new GraphWidget({
      title: 'Threat Protection risk (Cognito)',
      left: [cognitoMetric('Risk'), cognitoMetric('AccountTakeoverRisk')],
      right: [cognitoMetric('NoRisk')],
      width: 12,
    }),
  ]);

  // ── API / network ─────────────────────────────────────────────────────
  const appSyncMetric = (metricName: string, statistic = 'Sum') =>
    new Metric({
      namespace: 'AWS/AppSync',
      metricName,
      dimensionsMap: { GraphQLAPIId: apiId },
      statistic,
      period: Duration.minutes(5),
    });

  const appSync5xxMetric = appSyncMetric('5XXError');

  new Alarm(stack, 'AppSync5xxAlarm', {
    alarmName: `nulldevice-appsync-5xx-${branchName}`,
    metric: appSync5xxMetric,
    threshold: 5,
    evaluationPeriods: 1,
    comparisonOperator: ComparisonOperator.GREATER_THAN_THRESHOLD,
    treatMissingData: TreatMissingData.NOT_BREACHING,
  }).addAlarmAction(alertAction);

  dashboardWidgets.push([
    new GraphWidget({
      title: 'AppSync requests / errors',
      left: [appSyncMetric('Requests')],
      right: [appSyncMetric('4XXError'), appSync5xxMetric],
      width: 12,
    }),
    new GraphWidget({
      title: 'AppSync latency',
      left: [appSyncMetric('Latency', 'Average')],
      width: 12,
    }),
  ]);

  if (appId) {
    const hostingMetric = (metricName: string, statistic = 'Sum') =>
      new Metric({
        namespace: 'AWS/AmplifyHosting',
        metricName,
        dimensionsMap: { App: appId },
        statistic,
        period: Duration.minutes(5),
      });

    dashboardWidgets.push([
      new GraphWidget({
        title: 'Hosting requests / errors',
        left: [hostingMetric('Requests')],
        right: [hostingMetric('4xxErrors'), hostingMetric('5xxErrors')],
        width: 12,
      }),
      new GraphWidget({
        title: 'Hosting latency',
        left: [hostingMetric('Latency', 'Average')],
        width: 12,
      }),
    ]);
  }

  // ── Operational health ────────────────────────────────────────────────
  const lambdaFunctionNames = [
    backend.customerAccessActivation.resources.lambda.functionName,
    `ses-forwarder-nulldevice-${branchName}`,
  ];

  const lambdaErrorAlarms: GraphWidget[] = [];
  for (const functionName of lambdaFunctionNames) {
    const errorsMetric = new Metric({
      namespace: 'AWS/Lambda',
      metricName: 'Errors',
      dimensionsMap: { FunctionName: functionName },
      statistic: 'Sum',
      period: Duration.minutes(5),
    });
    const durationMetric = new Metric({
      namespace: 'AWS/Lambda',
      metricName: 'Duration',
      dimensionsMap: { FunctionName: functionName },
      statistic: 'Average',
      period: Duration.minutes(5),
    });

    new Alarm(stack, `LambdaErrorsAlarm-${functionName}`, {
      alarmName: `nulldevice-lambda-errors-${functionName}`,
      metric: errorsMetric,
      threshold: 0,
      evaluationPeriods: 1,
      comparisonOperator: ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: TreatMissingData.NOT_BREACHING,
    }).addAlarmAction(alertAction);

    lambdaErrorAlarms.push(
      new GraphWidget({
        title: `${functionName} errors / duration`,
        left: [errorsMetric],
        right: [durationMetric],
        width: 12,
      }),
    );
  }
  for (let i = 0; i < lambdaErrorAlarms.length; i += 2) {
    dashboardWidgets.push(lambdaErrorAlarms.slice(i, i + 2));
  }

  const dynamoThrottleMetricsById: Record<string, Metric> = {};
  for (const modelName of DYNAMO_TABLES_TO_WATCH) {
    dynamoThrottleMetricsById[modelName.toLowerCase()] = new Metric({
      namespace: 'AWS/DynamoDB',
      metricName: 'ThrottledRequests',
      dimensionsMap: { TableName: `${modelName}-${apiId}-NONE` },
      statistic: 'Sum',
      period: Duration.minutes(5),
    });
  }
  const dynamoThrottleMetrics = Object.values(dynamoThrottleMetricsById);

  // CloudWatch alarms need a single metric, so sum the per-table throttle
  // counts into one expression -- the alarm fires if *any* tracked table
  // throttles, while the dashboard widget below still breaks it out per table.
  const totalDynamoThrottles = new MathExpression({
    expression: `SUM([${Object.keys(dynamoThrottleMetricsById).join(', ')}])`,
    usingMetrics: dynamoThrottleMetricsById,
    period: Duration.minutes(5),
  });

  new Alarm(stack, 'DynamoThrottleAlarm', {
    alarmName: `nulldevice-dynamodb-throttles-${branchName}`,
    metric: totalDynamoThrottles,
    threshold: 0,
    evaluationPeriods: 1,
    comparisonOperator: ComparisonOperator.GREATER_THAN_THRESHOLD,
    treatMissingData: TreatMissingData.NOT_BREACHING,
  }).addAlarmAction(alertAction);

  dashboardWidgets.push([
    new GraphWidget({
      title: 'DynamoDB throttled requests',
      left: dynamoThrottleMetrics,
      width: 24,
    }),
  ]);

  new Dashboard(stack, 'OpsDashboard', {
    dashboardName: `NullDeviceOps-${branchName}`,
    widgets: dashboardWidgets,
  });
}
