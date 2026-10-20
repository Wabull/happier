import { describe, expect, it } from 'vitest';

import { buildDiscussionPrompt } from './DiscussionProfile';

describe('buildDiscussionPrompt', () => {
  it('answers the user message and names the speaker', () => {
    const prompt = buildDiscussionPrompt({
      instructions: 'Which name is best?',
      initialContext: 'User asked A: Suggest names\n\nA answered: Alpha, Beta',
      intentInput: { speaker: 'B' },
    });

    expect(prompt).toContain('You are participant B');
    expect(prompt).toContain('User question:\n\nWhich name is best?');
  });

  it('continues the discussion when there is no new user message', () => {
    const prompt = buildDiscussionPrompt({
      instructions: '',
      initialContext: 'User asked A: Suggest names\n\nA answered: Alpha, Beta',
      intentInput: { speaker: 'B' },
    });

    expect(prompt).toContain('You are participant B');
    expect(prompt).toContain('There is no new user message. It is your turn');
    expect(prompt).not.toContain('User question:');
  });
});
