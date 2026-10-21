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
});
