/** Lightweight shared definitions; do not load large offline dictionaries in UI. */
export type Kind = 'PERSON' | 'FIRST_NAME' | 'LAST_NAME' | 'EMAIL' | 'PHONE' | 'IBAN' | 'DATE' | 'TIME' | 'ADDRESS' | 'STREET' | 'CITY' | 'POSTAL_CODE' | 'URL' | 'IP' | 'BIC' | 'ID' | 'LICENSE_PLATE' | 'OTHER';
export interface Finding {
  id: string;
  kind: Kind;
  text: string;
  start: number;
  end: number;
  origin: 'automatic' | 'manual';
  /** An uncertain lexicon-only candidate is shown but not replaced until confirmed. */
  confidence?: 'certain' | 'probable' | 'review';
}
export const KIND_LABELS: Record<Kind, string> = {
  PERSON:'Name', FIRST_NAME:'Vorname', LAST_NAME:'Nachname', EMAIL:'E-Mail', PHONE:'Telefon', IBAN:'IBAN', DATE:'Datum', TIME:'Uhrzeit',
  ADDRESS:'Adresse', STREET:'Straße', CITY:'Ort / Stadt', POSTAL_CODE:'Postleitzahl', URL:'Webadresse', IP:'IP-Adresse',
  BIC:'BIC / SWIFT', ID:'Kennnummer / Aktenzeichen', LICENSE_PLATE:'Kfz-Kennzeichen', OTHER:'Sonstiges'
};
export function sameTerm(a:string,b:string):boolean {
  return a.normalize('NFC').toLocaleLowerCase('de') === b.normalize('NFC').toLocaleLowerCase('de');
}
export function overlaps(a:Pick<Finding,'start'|'end'>, b:Pick<Finding,'start'|'end'>):boolean {
  return a.start<b.end && b.start<a.end;
}

