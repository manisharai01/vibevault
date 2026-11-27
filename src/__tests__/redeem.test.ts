// Using a coupon: the code is copied before the store opens, and failures are reported.

import { Linking } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { redeemOffer } from '../services/redeem';

jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn() }));

const setStringAsync = Clipboard.setStringAsync as jest.MockedFunction<typeof Clipboard.setStringAsync>;

describe('redeemOffer', () => {
  let openURL: jest.SpyInstance;
  const calls: string[] = [];

  beforeEach(() => {
    calls.length = 0;
    setStringAsync.mockReset().mockImplementation(async (text: string) => {
      calls.push(`copy ${text}`);
      return true;
    });
    openURL = jest.spyOn(Linking, 'openURL').mockImplementation(async (url: string) => {
      calls.push(`open ${url}`);
      return true;
    });
  });

  afterEach(() => openURL.mockRestore());

  it('copies the code, then opens the store', async () => {
    await expect(redeemOffer({ code: 'MYNTRA10', url: 'https://example.com/offer' })).resolves.toEqual({ copied: true, opened: true });
    expect(calls).toEqual(['copy MYNTRA10', 'open https://example.com/offer']);
  });

  it('only opens the store for a deal without a code', async () => {
    await expect(redeemOffer({ code: null, url: 'https://example.com/deal' })).resolves.toEqual({ copied: false, opened: true });
    expect(setStringAsync).not.toHaveBeenCalled();
  });

  it('still opens the store when copying is refused', async () => {
    setStringAsync.mockRejectedValueOnce(new Error('NotAllowedError'));
    await expect(redeemOffer({ code: 'X', url: 'https://example.com/offer' })).resolves.toEqual({ copied: false, opened: true });
  });

  it('reports a store that could not be opened', async () => {
    openURL.mockRejectedValueOnce(new Error('No app can open this URL'));
    await expect(redeemOffer({ code: 'X', url: 'https://example.com/offer' })).resolves.toEqual({ copied: true, opened: false });
  });
});
