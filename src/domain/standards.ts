/** The calibration standard that applies to an instrument: its own override, else its type's. */
export type StandardSource = { standardCode: string | null; standardDate: Date | null };

export function effectiveStandard(i: StandardSource & { type: StandardSource }): StandardSource & { inherited: boolean } {
  return i.standardCode
    ? { standardCode: i.standardCode, standardDate: i.standardDate, inherited: false }
    : { standardCode: i.type.standardCode, standardDate: i.type.standardDate, inherited: !!i.type.standardCode };
}
