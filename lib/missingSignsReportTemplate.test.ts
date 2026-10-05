import Handlebars from 'handlebars';
import { missingSignsReportTemplate } from '@/amplify/ses/missingSignsReportTemplate';
import { missingSignsReportEmail } from './missingSignsReport';

// SES renders templates with Handlebars, escaping {{ }} as Handlebars does.
const render = (part: string, data: object) => Handlebars.compile(part)(data);

const email = missingSignsReportEmail({
  routeCode: 'W40-26-003',
  customerName: 'Harcourts <Epping>',
  placementDate: '2026-10-06',
  pickupDate: '2026-10-10',
  properties: [
    { address: '44 Eastcote Rd, North Epping', missing: 1 },
    { address: '5 <script>alert(1)</script> & Sons Lane', missing: 2 },
  ],
  total: 3,
  logoUrl: 'https://portal.example.com/logo.svg',
  year: '2026',
});
const { subjectPart, htmlPart, textPart } = missingSignsReportTemplate;

describe('missingSignsReportTemplate (#489)', () => {
  it('keeps the subject the report has always had', () => {
    expect(render(subjectPart, email.templateData)).toBe(email.subject);
  });

  it('shows the dates, a row per Property and the total', () => {
    const html = render(htmlPart, email.templateData);

    expect(html).toContain('Missing Signs');
    expect(html).toContain('Hi Harcourts &lt;Epping&gt;,');
    expect(html).toContain('When we collected the signs for Route W40-26-003');
    expect(html).toContain('Oct 6, 2026');
    expect(html).toContain('Oct 10, 2026');
    expect(html).toContain('44 Eastcote Rd, North Epping');
    expect(html).toMatch(/Total missing[\s\S]*3 signs/);
    expect(html).toContain('This is an automated message. Please do not reply.');
    expect(html).toContain('&copy; 2026 NullDevice');
  });

  it('escapes every value', () => {
    const html = render(htmlPart, email.templateData);

    expect(html).not.toContain('<script>');
    expect(html).toContain('5 &lt;script&gt;alert(1)&lt;/script&gt; &amp; Sons Lane');
    expect(htmlPart + textPart + subjectPart).not.toContain('{{{');
  });

  it('carries the same content in plain text', () => {
    const text = render(textPart, email.templateData);

    expect(text).toContain('When we collected the signs for Route W40-26-003');
    expect(text).toContain('Placed: Oct 6, 2026');
    expect(text).toContain('Collected: Oct 10, 2026');
    expect(text).toContain('44 Eastcote Rd, North Epping: 1 sign');
    expect(text).toContain('Total missing: 3 signs');
  });

  it('has no link into the portal and speaks of Properties and signs only', () => {
    const html = render(htmlPart, email.templateData);

    expect(html).not.toMatch(/<a\b/i);
    expect(html.match(/https?:\/\/[^"'\s<]+/g)).toEqual(['https://portal.example.com/logo.svg']);
    expect(htmlPart + textPart).not.toMatch(/operator|driver|staff|portal/i);
  });
});
