export type WageType = 'HOURLY' | 'MONTHLY' | 'PER_TASK'

export interface Wage {
  type: WageType
  amount: number
}

/** 임금 유형의 화면 표기 라벨 */
export const wageTypeLabel: Record<WageType, string> = {
  HOURLY: '시급',
  MONTHLY: '월급',
  PER_TASK: '건별',
}

export interface Job {
  id: string
  title: string
  employer: string
  wage: Wage
  /** 주 근무시간 — 공고에 따라 없을 수 있다 */
  weeklyHours?: number
  /** 근무 요일 표기 (자유 텍스트) */
  workDays?: string
  description: string
}

/**
 * 목 공고 데이터.
 * 임금 조건 문구("세전", "주휴수당 포함" 등)는 실서비스처럼
 * 구조화 필드가 아니라 description 자유 텍스트에만 존재한다.
 */
export const jobs: Job[] = [
  {
    id: 'job-1',
    title: '편의점 야간 스태프',
    employer: '한결마트 24시점',
    wage: { type: 'HOURLY', amount: 10320 },
    weeklyHours: 24,
    workDays: '금·토·일',
    description:
      '야간(22시~다음 날 6시) 근무입니다. 표기 시급은 주휴수당 포함 금액이며, 카운터 계산과 매대 정리를 맡습니다. 야간 근무 경험자 우대.',
  },
  {
    id: 'job-2',
    title: '카페 주말 오픈조 바리스타',
    employer: '모퉁이커피',
    wage: { type: 'HOURLY', amount: 11000 },
    workDays: '토·일',
    description:
      '주말 오픈조(8시~14시) 근무입니다. 표기 금액은 세전 기준이고, 주 근무시간은 매장 상황에 따라 협의합니다. 에스프레소 머신 사용 경험 우대.',
  },
  {
    id: 'job-3',
    title: '분식집 주방 보조',
    employer: '골목분식',
    wage: { type: 'HOURLY', amount: 10500 },
    weeklyHours: 15,
    workDays: '평일 중 3일',
    description:
      '점심 피크타임(11시~16시)에 설거지와 재료 손질을 돕습니다. 식사 제공, 세전 기준.',
  },
  {
    id: 'job-4',
    title: '보습학원 데스크 행정',
    employer: '더채움학원',
    wage: { type: 'MONTHLY', amount: 2100000 },
    weeklyHours: 40,
    workDays: '월~금',
    description:
      '학부모 응대, 수납, 출결 관리를 담당합니다. 월급은 세전 기준이며 4대 보험 가입, 3개월 수습 후 조정 가능.',
  },
  {
    id: 'job-5',
    title: '물류센터 사무 보조',
    employer: '두리물류',
    wage: { type: 'MONTHLY', amount: 2300000 },
    weeklyHours: 40,
    workDays: '월~금',
    description:
      '전표 정리와 입출고 데이터 입력 업무입니다. 세전 월급이며 명절 상여 별도. 엑셀 기본 사용 가능해야 합니다.',
  },
  {
    id: 'job-6',
    title: '아파트 단지 전단지 배포',
    employer: '초록홍보물',
    wage: { type: 'PER_TASK', amount: 60000 },
    workDays: '협의',
    description:
      '단지 1곳 배포 완료 기준으로 건별 지급합니다. 배포 인증 사진 필수, 원하는 날짜에 진행할 수 있습니다.',
  },
]

/** 임금 유형으로 공고를 걸러낸다. 원본 배열은 변경하지 않는다. */
export function filterJobsByWageType(list: Job[], type: WageType): Job[] {
  return list.filter((job) => job.wage.type === type)
}
