// Reads an ad's free-text terms (plus the seller nickname) and pulls out the conditions a P2P trader cares about.
// Works on Russian, Turkish and English text. Every verdict keeps the phrase it was based on, so it can be checked.

export type ThirdParty = "accepted" | "rejected" | "unknown";

export type Flag = {
  id: string;
  label: string;
  quote: string;
};

export type AmountTerms = {
  fixed: number[]; // "строго на 29 400", "на суммы 25.000 / 40.000"
  multipleOf: number | null; // "кратные 5000"
  minAmount: number | null; // "заходить свыше 1000р"
  quote: string;
};

export type AdAnalysis = {
  amounts: AmountTerms;
  thirdParty: ThirdParty;
  thirdPartyQuote: string;
  banksMentioned: string[];
  banksExcluded: string[];
  banksOnly: boolean;
  minOrders: number | null;
  flags: Flag[];
};


// JavaScript's \w and \b only know ASCII letters, so Cyrillic words never matched.
// rx() rewrites them into Unicode-aware versions and compiles with the "u" flag.
const WORD = "[\\p{L}\\d_]";
const EDGE = "(?:(?<![\\p{L}\\d])(?=[\\p{L}\\d])|(?<=[\\p{L}\\d])(?![\\p{L}\\d]))";
function rx(re: RegExp, extra = ""): RegExp {
  const source = re.source.replace(/\\w/g, WORD).replace(/\\b/g, EDGE);
  const flags = [...new Set((re.flags + extra + "u").split(""))].join("");
  return new RegExp(source, flags);
}

type Bank = { name: string; re: RegExp };

// Aliases are matched case-insensitively against normalized text (ё→е, Turkish letters folded).
const BANKS: Bank[] = ([
  // Russia
  { name: "Сбербанк", re: /\bсбер|\bsber/ },
  { name: "Т-Банк (Тинькофф)", re: /тинь?к|\bт-?банк|\btbank|\bt-bank|tinkoff|tinkof/ },
  { name: "Альфа-Банк", re: /\bальф|alfa ?bank|\balfa\b/ },
  { name: "ВТБ", re: /\bвтб|\bvtb/ },
  { name: "Райффайзен", re: /\bрайф|raiff/ },
  { name: "Озон Банк", re: /\bозон|\bozon/ },
  { name: "Газпромбанк", re: /газпром|\bгпб\b|gazprom/ },
  { name: "Росбанк", re: /росбанк|rosbank/ },
  { name: "Совкомбанк", re: /совком|sovcom/ },
  { name: "МТС Банк", re: /\bмтс|\bmts ?bank/ },
  { name: "Почта Банк", re: /почта ?банк/ },
  { name: "ПСБ", re: /\bпсб\b|промсвязь/ },
  { name: "Уралсиб", re: /уралсиб/ },
  { name: "Яндекс Банк", re: /яндекс|yandex/ },
  { name: "ЮMoney", re: /юмани|ю-?money|yoomoney/ },
  { name: "Ак Барс", re: /ак ?барс/ },
  { name: "Хоум Банк", re: /\bхоум|home ?credit/ },
  { name: "Россельхозбанк", re: /россельхоз|\bрсхб/ },
  { name: "МКБ", re: /\bмкб\b/ },
  { name: "Открытие", re: /открыти/ },
  { name: "Русский Стандарт", re: /русск\w* стандарт/ },
  { name: "ОТП Банк", re: /\bотп\b|\botp ?bank/ },
  // Turkey
  { name: "Ziraat", re: /ziraat/ },
  { name: "İş Bankası", re: /\bis ?bank|isbank|\bis bankasi/ },
  { name: "Garanti", re: /garanti/ },
  { name: "Akbank", re: /akbank/ },
  { name: "Yapı Kredi", re: /yapi ?kredi/ },
  { name: "VakıfBank", re: /vakif/ },
  { name: "Halkbank", re: /halk ?bank/ },
  { name: "QNB", re: /\bqnb|finansbank/ },
  { name: "DenizBank", re: /deniz ?bank/ },
  { name: "Kuveyt Türk", re: /kuveyt/ },
  { name: "Enpara", re: /enpara/ },
  { name: "Papara", re: /papara/ },
  { name: "TEB", re: /\bteb\b/ },
  { name: "ING", re: /\bing\b(?! [a-z]{3,})/ },
  { name: "Fibabanka", re: /fiba/ },
  { name: "Albaraka", re: /albaraka/ },
  { name: "Şekerbank", re: /seker ?bank/ },
  { name: "Odeabank", re: /odea/ },
  { name: "Kuveyt/Katılım", re: /katilim/ },
  // India
  { name: "SBI", re: /\bsbi\b|state bank of india/ },
  { name: "HDFC", re: /hdfc/ },
  { name: "ICICI", re: /icici/ },
  { name: "Axis", re: /\baxis\b/ },
  { name: "Kotak", re: /kotak/ },
  { name: "PNB", re: /\bpnb\b|punjab national/ },
  { name: "Bank of Baroda", re: /baroda|\bbob\b/ },
  { name: "Paytm", re: /paytm/ },
  { name: "PhonePe", re: /phone ?pe/ },
  { name: "Google Pay", re: /google ?pay|\bgpay/ },
  { name: "UPI", re: /\bupi\b/ },
  { name: "IMPS", re: /\bimps\b/ },
] as Bank[]).map((bank) => ({ name: bank.name, re: rx(bank.re) }));

// Third-party wording in the three languages.
const THIRD_PARTY =
  rx(/(треть\w*\s+лиц\w*|3[\s\-хгйи]*\w{0,2}\s*лиц\w*|\b3л\b|чуж\w*\s+(карт|счет|банк)\w*|ucuncu\s+(sahis|kisi|taraf|parti)\w*|3[.\-]?\s*(cu|ncu|uncu)?\s*(sahis|kisi|taraf|parti)\w*|thirds?[\s-]*part\w*|3rd[\s-]*part\w*)/g)

const NEGATIVE =
  rx(/(\bне\s|\bнет\b|запрещ|нельзя|\bбез\b|строго|исключ|отказ|kabul\s+edilmez|kabul\s+etmiyor|kabul\s+edilmemekte|edilmez|calismiyor|calismam|istemiyor|etmiyor|yasak|olmaz|degil|hayir|kesinlikle|\bnot\b|\bno\b|don'?t|never|prohibit|forbidden|strictly|won'?t|reject)/g)

const POSITIVE =
  rx(/(принима\w*|можно|работаю|\bда\b|допуска\w*|kabul\s+edilir|kabul\s+ediyor|kabul\s+ederim|olur|accepted|\baccept\b|allowed|\bok\b|welcome)/g)

// "Only from your own account / names must match" means third parties are out.
const OWN_ONLY =
  rx(/(только\s+(со?\s+)?сво\w*\s+(карт|счет|банк)\w*|фио\s+\w*\s*(должн\w*\s+)?совпада|на\s+сво\w*\s+имя|владел\w*\s+карт\w*\s+(должен\s+)?совпада|kendi\s+(adiniza|adina|hesab)\w*|sadece\s+kendi|isim\w*\s+ayni|ayni\s+kisi\s+adina|own\s+account|same\s+name|name\s+must\s+match|name\w*[^.\n]{0,40}match\w*|kisisel\s+hesab\w*|arkadas\w*\s+hesab\w*|kendihesap|sadecekendi|no3rdparty|nothirdparty)/)

// A negated verb right next to the third-party words ("не принимаю", "do not accept", "kabul etmiyorum").
// Checked before the plain positive/negative distance test, because "принимаю" alone would win otherwise.
const NEG_VERB = rx(
  /(\bне\s+(принима|работа|бер|допуска|приму|беру)\w*|(do\s+not|don'?t|dont|never|not)\s+(\w+\s+(or|and)\s+)?(accept|allow|work|take)\w*|kabul\s+(etmiyor|etmem|edilmez|edilmemekte)\w*|calism(iyor|am)\w*|istemiyor\w*|\bno\s+(3rd|third)|\bбез\s+(3|трет))/g,
);

// "Приму от любых лиц", "1-3 лицо", "1-х и 3-х лиц": both the holder and third parties are fine.
const ANY_OK = rx(/(любых\s+лиц|любого\s+лица|люб\w*\s+лица|все\s+лица|всех\s+лиц|\b1\s*[-\/,и]\s*3\b|\b1[-\s]*[а-я]{0,3}\s+и\s+3|any\s+(person|party|name))/);

// "Only first persons / namesakes" means payments must come from the account holder.
const FIRST_ONLY = rx(/((\b1|\bперв[а-я]{0,4})[\-\s]*[а-я]{0,3}\s*лиц|однофамил|\bfirst[\s-]*part|\b1st[\s-]*part)/);

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/ı/g, "i")
    .replace(/ş/g, "s")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/İ/g, "i")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");
}

function sentences(text: string): string[] {
  return text
    .split(/\n+|(?<=[^\d][.!?;])\s+/u)
    .map((part) => part.trim())
    .filter(Boolean);
}

// A negation after "но / but / кроме / ama" talks about something else ("принимаю от 3 лиц, но не с Озона").
const CONTRAST = rx(/(\bно\b|\bbut\b|кроме|except|\bama\b|haric)/);

function nearest(re: RegExp, text: string, from: number, to: number, skipContrast = false): number {
  let best = Infinity;
  re.lastIndex = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const at = m.index;
    if (skipContrast && at > to && CONTRAST.test(text.slice(to, at))) continue;
    const distance = at < from ? from - at : at > to ? at - to : 0;
    if (distance < best) best = distance;
  }
  return best;
}

function clip(text: string, max = 160): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

function detectThirdParty(raw: string, nick: string): { verdict: ThirdParty; quote: string } {
  const list = sentences(raw);
  let accepted = "";
  for (const sentence of list) {
    const n = normalize(sentence);
    THIRD_PARTY.lastIndex = 0;
    const m = THIRD_PARTY.exec(n);
    if (!m) continue;
    if (nearest(NEG_VERB, n, m.index, m.index + m[0].length, true) <= 40) return { verdict: "rejected", quote: clip(sentence) };
    if (ANY_OK.test(n)) {
      if (!accepted) accepted = sentence;
      continue;
    }
    const neg = nearest(NEGATIVE, n, m.index, m.index + m[0].length, true);
    const pos = nearest(POSITIVE, n, m.index, m.index + m[0].length);
    if (neg < Infinity && neg <= pos) return { verdict: "rejected", quote: clip(sentence) };
    if (pos < Infinity && !accepted) accepted = sentence;
  }
  if (!accepted) accepted = list.find((sentence) => ANY_OK.test(normalize(sentence)) && /лиц|person|party/.test(normalize(sentence))) ?? "";
  if (accepted) return { verdict: "accepted", quote: clip(accepted) };
  for (const sentence of list) {
    const n = normalize(sentence);
    if (OWN_ONLY.test(n) || FIRST_ONLY.test(n)) return { verdict: "rejected", quote: clip(sentence) };
  }
  const nickNorm = normalize(nick).replace(/[\s_\-.]/g, "");
  if (OWN_ONLY.test(nickNorm) || /без3|bez3|no3/.test(nickNorm)) {
    return { verdict: "rejected", quote: `Ник продавца: ${nick}` };
  }
  return { verdict: "unknown", quote: "" };
}

const EXCLUDE_BEFORE = rx(/(кроме|исключ|\bне\s+(принима|работа|беру)\w*|\bбез\b|except|excluding|\bno\b|\bnot\b|haric|disinda|kabul\s+etmiyorum)[^.!?\n]{0,40}$/)
const EXCLUDE_AFTER = rx(/^[^.!?\n]{0,25}(не\s+принима|не\s+работа|haric|kabul\s+edilmez|not\s+accepted)/)
const ONLY_BEFORE = rx(/(только|исключительно|sadece|yalnizca|\bonly\b)[^.!?\n]{0,25}$/)

function detectBanks(raw: string): { mentioned: string[]; excluded: string[]; only: boolean } {
  const text = normalize(raw);
  const mentioned = new Set<string>();
  const excluded = new Set<string>();
  let only = false;
  for (const bank of BANKS) {
    const re = new RegExp(bank.re.source, "gu");
    for (let m = re.exec(text); m; m = re.exec(text)) {
      const before = text.slice(Math.max(0, m.index - 60), m.index);
      const after = text.slice(m.index + m[0].length, m.index + m[0].length + 40);
      if (EXCLUDE_BEFORE.test(before) || EXCLUDE_AFTER.test(after)) excluded.add(bank.name);
      else {
        mentioned.add(bank.name);
        if (ONLY_BEFORE.test(before)) only = true;
      }
    }
  }
  for (const name of excluded) mentioned.delete(name);
  return { mentioned: [...mentioned], excluded: [...excluded], only };
}

function detectMinOrders(text: string): { value: number; quote: string } | null {
  const patterns = [
    /(от|не менее|минимум|более|больше)\s*(\d{1,4})\s*(успешн\w*\s+)?(сдел|ордер|order)/,
    /(\d{1,4})\+?\s*(сдел\w*|ордер\w*)\s*(и более|минимум|обязательно)/,
    /en az\s*(\d{1,4})\s*(islem|siparis)/,
    /(\d{1,4})\s*(islem|siparis)\w*\s*(altinda|alti)/,
    /(at least|min(imum)?\.?|more than)\s*(\d{1,4})\s*(completed\s+)?(orders|trades)/,
  ];
  for (const raw of patterns) {
    const re = rx(raw);
    const m = re.exec(text);
    if (!m) continue;
    const num = m.slice(1).map((part) => Number(part)).find((value) => Number.isFinite(value) && value > 0);
    if (num) return { value: num, quote: m[0] };
  }
  return null;
}

const FLAG_RULES: Array<{ id: string; label: string; re: RegExp }> = ([
  { id: "receipt", label: "Нужен чек / квитанция", re: /(pdf|чек|квитанц|dekont|makbuz|receipt|screenshot of (the )?payment)/ },
  { id: "video", label: "Может запросить видео или скрин ЛК", re: /(видео|video|\bлк\b|личн\w* кабинет|скрин\w* (из )?(лк|приложени|банк)|ekran goruntus|selfie|селфи)/ },
  { id: "no-comment", label: "Нельзя писать про крипту в комментарии", re: /((не|нельзя)\s+(пиш|указ|упомин)\w*[^.\n]{0,40}(коммент|назначени|крипт|usdt|бинанс|binance|байбит)|aciklama\w*[^\n]{0,70}(yazma|yazmayin|yazmayiniz)|(do not|don'?t|never)\s+(write|mention|put)[^\n]{0,50}(crypto|usdt|binance|bybit))/ },
  { id: "no-split", label: "Не дробить оплату", re: /(не\s+дроб|одним\s+платеж|split|bolmeyin|parcali)/ },
  { id: "no-refund", label: "Ошибся с оплатой — без возврата", re: /(возврат\w*\s+нет|без\s+возврат|не\s+возвраща|iade\s+(yok|edilmez|yapilmaz)|no\s+refund)/ },
  { id: "sbp", label: "СБП / по номеру телефона", re: /(\bсбп\b|\bsbp\b|по\s+номеру\s+телефона)/ },
  { id: "card", label: "Перевод по номеру карты", re: /(по\s+номеру\s+карты|на\s+карту|card\s+number)/ },
  { id: "fee", label: "Упоминается комиссия", re: /(комисси|komisyon|\bfee\b|commission)/ },
  { id: "kyc", label: "Нужна верификация (KYC)", re: /(верифицир|верификац|\bkyc\b|kimlik\s+dogrula|verified\s+(account|users))/ },
] as Array<{ id: string; label: string; re: RegExp }>).map((rule) => ({ ...rule, re: rx(rule.re) }));

/* ---------- amounts written in the terms ---------- */

const AMOUNT_TRIGGER = rx(
  /(заход\w*|выкуп\w*|строго|только|ровно|на\s+сумм\w*|сумм\w*\s*[:(]|кратн\w*|приму\s+только|свыше|\btutar\w*|\bmiktar\w*|exact\w*\s+amount|only\s+amount|amount\s*:)/,
);
const MULTIPLE = rx(/(кратн\w*|multiple\s+of|katlari)/);
const MIN_WORD = rx(/(свыше|не\s+менее|не\s+меньше|\bот|больше|минимум|minimum|\bmin\b|en\s+az|from)\s*$/);
// Numbers like 29400, 29 400, 92.700, 175 800, 49к, 10 тыс
const NUMBER = /(\d{1,3}(?:[  .,]\d{3})+|\d+(?:[.,]\d{1,2})?)\s*(к|k|тыс\w*|т\.?\s?р\.?)?(?![\d])/giu;
// Numbers that are clearly not amounts: counts, percents, minutes, laws ("115-ФЗ")
const NOT_AMOUNT_AFTER = rx(/^\s*(%|\+?\s*сдел|лиц|отзыв|мин|час|дн|сек|раз|шт|-?\s*фз|-?\s*ф3|usdt|order|ордер\w*\s+(в|за)|islem|gun|p2p)/);

function toAmount(raw: string, suffix: string | undefined): number | null {
  let digits = raw.replace(/[  ]/g, "");
  if (/^\d{1,3}([.,]\d{3})+$/.test(digits)) digits = digits.replace(/[.,]/g, "");
  else digits = digits.replace(",", ".");
  let value = Number(digits);
  if (!Number.isFinite(value)) return null;
  if (suffix && /^(к|k|тыс|т)/i.test(suffix)) value *= 1000;
  return value;
}

function numbersIn(line: string): number[] {
  const out: number[] = [];
  NUMBER.lastIndex = 0;
  for (let m = NUMBER.exec(line); m; m = NUMBER.exec(line)) {
    const after = line.slice(m.index + m[0].length, m.index + m[0].length + 14);
    if (NOT_AMOUNT_AFTER.test(after)) continue;
    const value = toAmount(m[1] ?? "", m[2]);
    if (value === null || value < 100 || value >= 100_000_000) continue;
    out.push(value);
  }
  return out;
}

export function parseAmounts(remarks: string): AmountTerms {
  const result: AmountTerms = { fixed: [], multipleOf: null, minAmount: null, quote: "" };
  const lines = remarks.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    const n = normalize(line);
    if (!AMOUNT_TRIGGER.test(n)) continue;
    let nums = numbersIn(n);
    let quote = line;
    // "Возможные суммы:" followed by numbers on the next lines
    if (!nums.length && /[:：]\s*$/.test(n)) {
      const next = lines.slice(i + 1, i + 4).filter((l) => /^[^a-zа-я]*\d/i.test(normalize(l)));
      nums = next.flatMap((l) => numbersIn(normalize(l)));
      if (nums.length) quote = [line, ...next].join(" ");
    }
    if (!nums.length) continue;
    if (MULTIPLE.test(n)) {
      if (result.multipleOf === null) result.multipleOf = nums[0] ?? null;
      if (!result.quote) result.quote = clip(quote, 140);
      continue;
    }
    const idx = n.search(/\d/);
    const strict = rx(/(строго|ровно|только|exact)/).test(n);
    if (!strict && MIN_WORD.test(n.slice(0, idx))) {
      if (result.minAmount === null) result.minAmount = nums[0] ?? null;
      if (!result.quote) result.quote = clip(quote, 140);
      continue;
    }
    for (const value of nums) if (!result.fixed.includes(value) && result.fixed.length < 12) result.fixed.push(value);
    if (!result.quote || result.quote.length < 3) result.quote = clip(quote, 140);
  }
  result.fixed.sort((a, b) => a - b);
  return result;
}

/* ---------- one name per bank across exchanges ---------- */

const EXTRA_NAMES: Array<{ name: string; re: RegExp }> = [
  { name: "СБП", re: /^(sbp|сбп|fast ?payment\w*)$/ },
  { name: "ПСБ", re: /^(psb|psbank|promsvyaz\w*)$/ },
  { name: "Ак Барс", re: /^ak ?bars\w*$/ },
  { name: "МТС Банк", re: /^mts ?bank\w*$/ },
  { name: "Почта Банк", re: /^pochta\w*$/ },
  { name: "Уралсиб", re: /^uralsib\w*$/ },
  { name: "Россельхозбанк", re: /^(rshb|rosselkhoz\w*)$/ },
  { name: "Хоум Банк", re: /^home ?(credit|bank)\w*$/ },
  { name: "Международный перевод", re: /^international[ _]?transfer$/ },
  { name: "Dushanbe City Bank", re: /^dushanbe ?city ?bank$/ },
];

// Maps an exchange's payment label ("sberbankru", "İŞBANK", "Kuveyt Turk") to the same name the terms analysis uses.
// Returns null for generic methods that are not a bank ("Bank Transfer", "Cash in Person").
export function canonicalBank(raw: string): string | null {
  const n = normalize(raw).replace(/[_-]+/g, " ").trim();
  for (const extra of EXTRA_NAMES) if (extra.re.test(n)) return extra.name;
  for (const bank of BANKS) {
    bank.re.lastIndex = 0;
    if (bank.re.test(n)) return bank.name;
  }
  return null;
}

export function analyzeAd(remarks: string, nick: string): AdAnalysis {
  const text = normalize(remarks);
  const third = detectThirdParty(remarks, nick);
  const banks = detectBanks(remarks);
  const minOrders = detectMinOrders(text);
  const flags: Flag[] = [];
  for (const rule of FLAG_RULES) {
    // Whole lines, not sentences: abbreviations like "vb." would split a rule in half.
    for (const sentence of remarks.split(/\n+/).map((line) => line.trim()).filter(Boolean)) {
      if (rule.re.test(normalize(sentence))) {
        flags.push({ id: rule.id, label: rule.label, quote: clip(sentence, 120) });
        break;
      }
    }
  }
  return {
    amounts: parseAmounts(remarks),
    thirdParty: third.verdict,
    thirdPartyQuote: third.quote,
    banksMentioned: banks.mentioned,
    banksExcluded: banks.excluded,
    banksOnly: banks.only,
    minOrders: minOrders?.value ?? null,
    flags,
  };
}
