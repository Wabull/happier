import { describe, expect, it } from 'vitest';

import { ca } from './translations/ca';
import { de } from './translations/de';
import { en } from './translations/en';
import { es } from './translations/es';
import { fr } from './translations/fr';
import { it as itLocale } from './translations/it';
import { ja } from './translations/ja';
import { pl } from './translations/pl';
import { pt } from './translations/pt';
import { ru } from './translations/ru';
import { zhHans } from './translations/zh-Hans';
import { zhHant } from './translations/zh-Hant';

const locales = { ca, de, en, es, fr, it: itLocale, ja, pl, pt, ru, 'zh-Hans': zhHans, 'zh-Hant': zhHant } as const;

describe('discussion translations', () => {
    it('distinguishes failure from a user stop and preserves the failure detail in every locale', () => {
        for (const [locale, translation] of Object.entries(locales)) {
            const stopped = translation.runs.discussion.status.stopped;
            const failed = translation.runs.discussion.status.failed({ error: 'DETAIL' });
            expect(failed, locale).not.toBe(stopped);
            expect(failed, locale).toContain(translation.runs.discussion.failed);
            expect(failed, locale).toContain('DETAIL');
        }
    });

    it('uses Polish turn plurals for every supported open-discussion limit', () => {
        const expected = [
            'Otwarta · 1 tura',
            'Otwarta · 2 tury',
            'Otwarta · 3 tury',
            'Otwarta · 4 tury',
            'Otwarta · 5 tur',
            'Otwarta · 6 tur',
            'Otwarta · 7 tur',
            'Otwarta · 8 tur',
            'Otwarta · 9 tur',
            'Otwarta · 10 tur',
            'Otwarta · 11 tur',
            'Otwarta · 12 tur',
        ];

        expect(expected.map((_, index) => pl.runs.discussion.modeChipOpen({ limit: index + 1 }))).toEqual(expected);
    });

    it('defines every Traditional Chinese discussion label without inheriting Simplified Chinese copy', () => {
        const discussion = zhHant.runs.discussion;
        expect({
            engine: discussion.engine,
            model: discussion.model,
            modelDefault: discussion.modelDefault,
            modelPlaceholder: discussion.modelPlaceholder,
            modes: discussion.modes,
            modeHelp: discussion.modeHelp,
            turnLimit: discussion.turnLimit,
            turnLimitDecrease: discussion.turnLimitDecrease,
            turnLimitIncrease: discussion.turnLimitIncrease,
            toggle: discussion.toggle,
            toggleOn: discussion.toggleOn,
            participantChip: discussion.participantChip({ label: 'A', model: '模型一' }),
            participantTitle: discussion.participantTitle({ label: 'A' }),
            modeTitle: discussion.modeTitle,
            observedModel: discussion.observedModel({ model: '模型一' }),
            modeChipOpen: discussion.modeChipOpen({ limit: 3 }),
            status: {
                openReplying: discussion.status.openReplying({ turn: 1, total: 3, names: 'A、B' }),
                replying: discussion.status.replying({ names: 'A、B' }),
                stopped: discussion.status.stopped,
                failed: discussion.status.failed({ error: '錯誤' }),
                limitReached: discussion.status.limitReached,
                yourTurn: discussion.status.yourTurn,
            },
            errors: {
                couldNotStart: discussion.errors.couldNotStart({ speaker: 'A' }),
                runDidNotFinish: discussion.errors.runDidNotFinish({ speaker: 'A', status: '逾時' }),
                answerNotSaved: discussion.errors.answerNotSaved({ speaker: 'A' }),
                sourceUnavailable: discussion.errors.sourceUnavailable,
            },
            continue: discussion.continue,
            placeholder: discussion.placeholder({ mode: '輪流' }),
            replying: discussion.replying,
            stopped: discussion.stopped,
            failed: discussion.failed,
            newSharedChat: discussion.newSharedChat,
            newSharedChatTitle: discussion.newSharedChatTitle,
            newSharedChatPending: discussion.newSharedChatPending,
        }).toEqual({
            engine: '引擎',
            model: '模型',
            modelDefault: '預設',
            modelPlaceholder: '自訂模型 ID',
            modes: { take_turns: '輪流', both_reply: '同時回覆', open: '自由討論' },
            modeHelp: {
                take_turns: '你，然後 A，再由 B。B 可以看到 A 的回覆。',
                both_reply: 'A 和 B 同時回覆你的訊息。',
                open: 'A 和 B 依設定的輪數討論後停止。',
            },
            turnLimit: '輪數上限',
            turnLimitDecrease: '減少輪數',
            turnLimitIncrease: '增加輪數',
            toggle: '共享聊天',
            toggleOn: '共享聊天已開啟',
            participantChip: 'A · 模型一',
            participantTitle: '參與者 A',
            modeTitle: '聊天模式',
            observedModel: '實際 模型一',
            modeChipOpen: '自由 · 3 輪',
            status: {
                openReplying: '第 1/3 輪 · A、B 回覆中…',
                replying: 'A、B 回覆中…',
                stopped: '已停止',
                failed: '失敗：錯誤',
                limitReached: '已達輪數上限',
                yourTurn: '輪到你',
            },
            errors: {
                couldNotStart: '無法啟動 A',
                runDidNotFinish: 'A 未完成（逾時）',
                answerNotSaved: 'A 的回答尚未儲存',
                sourceUnavailable: '此工作階段沒有可用來啟動共享聊天的機器或資料夾。',
            },
            continue: '繼續',
            placeholder: '傳送給 A 和 B 的訊息（輪流）',
            replying: '回覆中…',
            stopped: '已停止',
            failed: '失敗',
            newSharedChat: '新增共享聊天',
            newSharedChatTitle: '共享聊天',
            newSharedChatPending: '工作階段正在啟動。請從側邊欄開啟並啟用共享聊天。',
        });
    });
});
