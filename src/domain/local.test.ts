import { describe, expect, it } from 'vitest';
import {
  cleanPhone, copiedFrom, findLocalAddress, findLocalName, findPhone, guessLang, hasLocal, langForPlace, localFromNominatim, toLocal, wrapPieces,
} from './local';
import { normalizeDoc } from './normalize';

describe('local text in the trip data', () => {
  it('old trips without local fields load unchanged', () => {
    const doc = normalizeDoc({
      trip: { name: 'T', start: '2027-01-22', end: '2027-02-08' },
      locations: [{ id: 'l1', name: 'Rusutsu' }],
      stays: [{ id: 's1', name: 'Westin', address: 'Rusutsu', checkIn: '2027-01-25', checkOut: '2027-01-28', status: 'booked' }],
      items: [{ id: 'i1', locationId: 'l1', kind: 'restaurant', title: 'Ramen', status: 'idea', placements: [] }],
      legs: [{ id: 'g1', mode: 'bus', fromName: 'CTS', toName: 'Rusutsu', date: '2027-01-25' }],
    });
    expect(doc.stays[0]).not.toHaveProperty('local');
    expect(doc.stays[0]).not.toHaveProperty('phone');
    expect(doc.items[0]).not.toHaveProperty('local');
    expect(doc.legs[0]).not.toHaveProperty('fromLocal');
  });
  it('keeps local names, addresses and phone numbers, and drops empty or broken ones', () => {
    const doc = normalizeDoc({
      locations: [{ id: 'l1', name: 'Rusutsu' }],
      stays: [{ id: 's1', name: 'Westin', local: { name: ' ザ・ウェスティン ルスツリゾート ', address: '〒048-1711 北海道虻田郡留寿都村泉川133' }, phone: '0136-46-3111' }],
      items: [
        { id: 'i1', locationId: 'l1', kind: 'activity', title: 'Onsen', local: { name: '', address: '  ' }, phone: 'call me' },
        { id: 'i2', locationId: 'l1', kind: 'restaurant', title: 'Ramen', local: 'nope' },
      ],
      legs: [{ id: 'g1', mode: 'train', fromName: 'Sapporo Stn', toName: 'Kutchan', toLocal: { name: '倶知安駅' }, fromLocal: { address: 42 } }],
    });
    expect(doc.stays[0].local).toEqual({ name: 'ザ・ウェスティン ルスツリゾート', address: '〒048-1711 北海道虻田郡留寿都村泉川133' });
    expect(doc.stays[0].phone).toBe('0136-46-3111');
    expect(doc.items[0]).not.toHaveProperty('local');
    expect(doc.items[0]).not.toHaveProperty('phone');
    expect(doc.items[1]).not.toHaveProperty('local');
    expect(doc.legs[0].toLocal).toEqual({ name: '倶知安駅' });
    expect(doc.legs[0]).not.toHaveProperty('fromLocal');
  });
  it('helpers', () => {
    expect(toLocal('  ', '')).toBeUndefined();
    expect(toLocal('', '北海道\n虻田郡')).toEqual({ address: '北海道 虻田郡' });
    expect(hasLocal({ name: ' ' })).toBe(false);
    expect(hasLocal({ address: '香港' })).toBe(true);
    expect(cleanPhone('＋81 (0)136-46-3111')).toBe('+81 (0)136-46-3111');
    expect(cleanPhone('12')).toBeUndefined();
  });
});

describe('language', () => {
  it('reads it from the text, or the place', () => {
    expect(guessLang('ザ・ウェスティン')).toBe('ja');
    expect(guessLang('北海道虻田郡留寿都村泉川133')).toBe('ja');
    expect(guessLang('札幌駅')).toBe('ja');
    expect(guessLang('香港九龍尖沙咀彌敦道20號')).toBe('zh-Hant');
    expect(guessLang('半島酒店', 'zh-Hant')).toBe('zh-Hant');
    expect(guessLang('서울역')).toBe('ko');
    expect(langForPlace({ lat: 22.29, lng: 114.17 })).toBe('zh-Hant');
    expect(langForPlace({ lat: 42.85, lng: 140.9 })).toBe('ja');
    expect(langForPlace(null, 'Nathan Road, Tsim Sha Tsui, Hong Kong')).toBe('zh-Hant');
    expect(langForPlace(null, 'Rusutsu')).toBe('ja');
  });
});

describe('OpenStreetMap results', () => {
  it('Japanese: local name, address big-to-small with the postcode', () => {
    const r = {
      name: 'ザ・ウェスティン ルスツリゾート',
      display_name: 'ザ・ウェスティン ルスツリゾート, 133, 泉川, 留寿都村, 虻田郡, 後志総合振興局, 北海道, 048-1711, 日本',
      address: { postcode: '048-1711', country: '日本', country_code: 'jp' },
      namedetails: { name: 'ザ・ウェスティン ルスツリゾート', 'name:en': 'The Westin Rusutsu Resort' },
    };
    expect(localFromNominatim(r, 'ja')).toEqual({ name: 'ザ・ウェスティン ルスツリゾート', address: '〒048-1711 北海道後志総合振興局虻田郡留寿都村泉川133' });
  });
  it('Hong Kong: Chinese words only from bilingual names', () => {
    const r = {
      name: '半島酒店 The Peninsula Hong Kong',
      display_name: '半島酒店 The Peninsula Hong Kong, 22, 梳士巴利道 Salisbury Road, 尖沙咀 Tsim Sha Tsui, 油尖旺區 Yau Tsim Mong District, 九龍 Kowloon, 香港 Hong Kong, 中国',
      address: { country: '中国', country_code: 'hk' },
      namedetails: { name: '半島酒店 The Peninsula Hong Kong', 'name:zh': '半島酒店', 'name:en': 'The Peninsula Hong Kong' },
    };
    expect(localFromNominatim(r, 'zh-Hant')).toEqual({ name: '半島酒店', address: '香港九龍油尖旺區尖沙咀梳士巴利道22' });
  });
  it('no local script: nothing to offer', () => {
    expect(localFromNominatim({ name: 'Some Hut', display_name: 'Some Hut, Hill Road, Niseko', namedetails: { name: 'Some Hut' } }, 'ja')).toBeUndefined();
  });
});

describe('wrapping', () => {
  it('keeps address units together and English words whole', () => {
    expect(wrapPieces('〒048-1711 北海道虻田郡留寿都村泉川133')).toEqual(['〒048-1711', ' ', '北海道', '虻田郡', '留寿都村泉川', '133']);
    expect(wrapPieces('東京都渋谷区道玄坂1-2-3')).toEqual(['東京都', '渋谷区', '道玄坂', '1-2-3']);
    expect(wrapPieces('The Westin Rusutsu')).toEqual(['The', ' ', 'Westin', ' ', 'Rusutsu']);
    expect(wrapPieces('香港九龍尖沙咀彌敦道20號').join('')).toBe('香港九龍尖沙咀彌敦道20號');
  });
});

describe('local text in emails', () => {
  const jp = `ご予約ありがとうございます。
施設名：ザ・ウェスティン ルスツリゾート
住所：〒048-1711 北海道虻田郡留寿都村泉川133
電話番号：0136-46-3111
チェックイン：2027年1月25日 15:00`;
  it('Japanese email: name after its label, the address, the phone', () => {
    expect(findLocalName(jp)).toBe('ザ・ウェスティン ルスツリゾート');
    expect(findLocalAddress(jp)).toBe('〒048-1711 北海道虻田郡留寿都村泉川133');
    expect(findPhone(jp)).toBe('0136-46-3111');
  });
  it('mixed English/Japanese email', () => {
    const mixed = `Your booking at The Westin Rusutsu Resort is confirmed.
Hotel address: 133 Izumikawa, Rusutsu, Abuta District, Hokkaido 048-1711
〒048-1711
北海道虻田郡留寿都村泉川133
Tel: +81 136-46-3111`;
    expect(findLocalAddress(mixed)).toBe('〒048-1711 北海道虻田郡留寿都村泉川133');
    expect(findPhone(mixed)).toBe('+81 136-46-3111');
    expect(findLocalName(mixed)).toBeUndefined();
  });
  it('English-only email: no local text', () => {
    expect(findLocalAddress('Address: 1 Queen St, Brisbane QLD 4000\nTel: 07 3000 0000')).toBeUndefined();
  });
  it('Hong Kong address', () => {
    expect(findLocalAddress('Address 地址: 香港九龍尖沙咀梳士巴利道22號')).toBe('香港九龍尖沙咀梳士巴利道22號');
  });
  it('checks text was copied from the email, not made up', () => {
    expect(copiedFrom('北海道虻田郡留寿都村泉川１３３', jp)).toBe(true);
    expect(copiedFrom('ザ・ウェスティン　ルスツリゾート', jp)).toBe(true);
    expect(copiedFrom('ウェスティンホテル', jp)).toBe(false);
  });
});
