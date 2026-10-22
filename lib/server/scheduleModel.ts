import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';

/**
 * Asks the Bedrock model that reads Route Request Schedules (ADR 0014) one
 * question and returns its text answer. Server routes only: the SSR role is the
 * one principal granted bedrock:InvokeModel (amplify/backend.ts), and an
 * AccessDenied here on a fresh branch means that grant hasn't deployed yet.
 *
 * The model comes from BEDROCK_SCHEDULE_MODEL_ID (amplify.yml writes it to
 * .env.production). It is deliberately not defaulted, so a branch without it
 * says so instead of calling a model nobody chose.
 */

const client = new BedrockRuntimeClient({ region: process.env.AWS_REGION || 'ap-southeast-2' });

export type AskScheduleModelInput = {
  system: string;
  prompt: string;
  maxTokens?: number;
};

// maxTokens also pays for the model's thinking, which is on by default, so leave room beyond the answer itself.
export async function askScheduleModel({ system, prompt, maxTokens = 8192 }: AskScheduleModelInput): Promise<string> {
  const modelId = process.env.BEDROCK_SCHEDULE_MODEL_ID;
  if (!modelId) throw new Error('BEDROCK_SCHEDULE_MODEL_ID is not set');

  const response = await client.send(
    new ConverseCommand({
      modelId,
      system: [{ text: system }],
      messages: [{ role: 'user', content: [{ text: prompt }] }],
      // No temperature: the Claude 5 models reject non-default sampling values (400).
      inferenceConfig: { maxTokens },
    })
  );

  if (response.stopReason === 'max_tokens') throw new Error('The model ran out of room before finishing its answer');
  const text = response.output?.message?.content?.map((part) => part.text ?? '').join('') ?? '';
  if (!text.trim()) throw new Error('The model returned no text');
  return text;
}
