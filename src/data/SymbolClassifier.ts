import { MarketType } from '../types/market.js';

/**
 * 标的分类器
 * 负责根据标的符号识别所属市场类型
 */
export class SymbolClassifier {
  private static readonly CRYPTO_PATTERN = /^(BTC|ETH|SOL|BNB|XRP|ADA|DOGE|DOT|MATIC|AVAX|LINK|UNI|ATOM|LTC|BCH|XLM|ALGO|VET|FIL|TRX|ETC|THETA|XMR|EOS|AAVE|MKR|COMP|SNX|YFI|SUSHI|CRV|BAL|UMA|ZRX|KNC|LRC|REN|BNT|ANT|MLN|NMR|REP|GNO|STORJ|BAT|ZIL|ICX|ONT|QTUM|ZEC|DASH|DCR|SC|DGB|RVN|BTG|NANO|WAVES|LSK|STEEM|STRAT|ARK|KMD|PIVX|NXT|BTS|MAID|XEM|ARDR|GAS|NEO|OMG|POWR|REQ|SALT|SUB|TNT|VEN|WTC|ZRX)/;

  classify(symbol: string): MarketType {
    if (symbol.includes('/') || symbol.includes('-') || SymbolClassifier.CRYPTO_PATTERN.test(symbol.toUpperCase())) {
      return MarketType.CRYPTO;
    }

    if (/^\d{6}\.(SH|SZ)$/i.test(symbol)) {
      return MarketType.STOCK_CN;
    }

    if (/^[A-Z]{1,5}$/i.test(symbol)) {
      return MarketType.STOCK_US;
    }

    throw new Error(`Unable to determine market type for symbol: ${symbol}`);
  }
}
