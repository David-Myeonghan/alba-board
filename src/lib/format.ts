/** 금액을 한국 표기(천 단위 쉼표 + '원')로 변환한다. 예: 10320 → "10,320원" */
export function formatCurrency(amount: number): string {
  return `${new Intl.NumberFormat('ko-KR').format(amount)}원`
}
