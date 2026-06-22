import { Linking } from 'react-native';
import { FashionItem, Platform } from '../types';

const fallbackUrl = (platform: Platform, title: string): string => {
  const q = encodeURIComponent(title);
  switch (platform) {
    case 'Myntra':
      return `https://www.myntra.com/${q}`;
    case 'Meesho':
      return `https://www.meesho.com/search?q=${q}`;
    case 'Amazon':
      return `https://www.amazon.in/s?k=${q}`;
    case 'Flipkart':
      return `https://www.flipkart.com/search?q=${q}`;
    case 'Depop':
      return `https://www.depop.com/search/?q=${q}`;
    case 'Poshmark':
      return `https://poshmark.com/search?query=${q}`;
    case 'Vinted':
      return `https://www.vinted.com/catalog?search_text=${q}`;
    case 'ThredUp':
      return `https://www.thredup.com/products?search_tags=${q}`;
    default:
      return `https://www.google.com/search?q=${q}+fashion`;
  }
};

export const openItemOnMarketplace = async (item: FashionItem): Promise<boolean> => {
  const target = item.productUrl || fallbackUrl(item.platform, item.title);
  try {
    const canOpen = await Linking.canOpenURL(target);
    if (!canOpen) {
      return false;
    }
    await Linking.openURL(target);
    return true;
  } catch {
    return false;
  }
};
