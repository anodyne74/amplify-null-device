/**
 * @jest-environment node
 */
const sendMock = jest.fn();

jest.mock('@aws-sdk/client-bedrock-runtime', () => ({
  BedrockRuntimeClient: jest.fn(() => ({ send: sendMock })),
  ConverseCommand: jest.fn((input: unknown) => ({ input })),
}));

import { askScheduleModel } from '@/lib/server/scheduleModel';

const answer = (text: string, stopReason = 'end_turn') => ({
  stopReason,
  output: { message: { content: [{ text }] } },
});

describe('askScheduleModel', () => {
  beforeEach(() => {
    sendMock.mockReset();
    process.env.BEDROCK_SCHEDULE_MODEL_ID = 'test-model';
  });
  afterAll(() => {
    delete process.env.BEDROCK_SCHEDULE_MODEL_ID;
  });

  it('sends the system text and prompt to the configured model and returns the answer', async () => {
    sendMock.mockResolvedValue(answer('[]'));

    await expect(askScheduleModel({ system: 'Read it', prompt: 'Sheet text' })).resolves.toBe('[]');

    expect(sendMock.mock.calls[0][0].input).toMatchObject({
      modelId: 'test-model',
      system: [{ text: 'Read it' }],
      messages: [{ role: 'user', content: [{ text: 'Sheet text' }] }],
    });
    // The Claude 5 models answer 400 to any sampling value that isn't their default.
    expect(sendMock.mock.calls[0][0].input.inferenceConfig).not.toHaveProperty('temperature');
  });

  it('refuses to call a model nobody chose', async () => {
    delete process.env.BEDROCK_SCHEDULE_MODEL_ID;
    await expect(askScheduleModel({ system: 's', prompt: 'p' })).rejects.toThrow('BEDROCK_SCHEDULE_MODEL_ID is not set');
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('does not hand back an answer cut off by the token limit', async () => {
    sendMock.mockResolvedValue(answer('[{"address":', 'max_tokens'));
    await expect(askScheduleModel({ system: 's', prompt: 'p' })).rejects.toThrow('ran out of room');
  });

  it('rejects an empty answer', async () => {
    sendMock.mockResolvedValue({ stopReason: 'end_turn', output: { message: { content: [] } } });
    await expect(askScheduleModel({ system: 's', prompt: 'p' })).rejects.toThrow('no text');
  });
});
