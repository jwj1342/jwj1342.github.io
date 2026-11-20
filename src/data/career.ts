/**
 * Career, newest first. The homepage draws this as a `git log --graph`:
 * `lane: 0` is the main line; `lane: 1` is a side branch for something done alongside
 * it (an internship, a remote position). A side branch with `merged: true` has ended
 * and joins the main line again; without it the branch is still open.
 */
export interface CareerEntry {
  org: string;
  /** Logo file in public/images/logos/. Without one, `mark` is shown instead. */
  logo?: string;
  /** Two or three letters shown in the tile when there is no logo. */
  mark: string;
  role: string;
  /** Advisors, shown in front of the role; `url` is their homepage, if known. */
  advisors?: { name: string; url?: string }[];
  when: string;
  lane: 0 | 1;
  merged?: boolean;
}

export const career: CareerEntry[] = [
  {
    org: 'University of Alberta',
    logo: 'ualberta.png',
    mark: 'UA',
    role: 'Incoming Ph.D. student',
    advisors: [{ name: 'Zhou Yang', url: 'https://homepage.zhouyang.me/' }],
    when: 'Sep 2026 — incoming',
    lane: 0,
  },
  {
    org: 'Microsoft',
    logo: 'microsoft.svg',
    mark: 'MS',
    role: 'Intern',
    advisors: [
      { name: 'Dayi Lin', url: 'https://lindayi.me/' },
      { name: 'Pengfei Gao', url: 'https://cumt-gpf.github.io/' },
    ],
    when: '2026 H2 — planned',
    lane: 1,
  },
  {
    org: 'RISE Lab, Singapore Management University',
    logo: 'smu.png',
    mark: 'SMU',
    role: 'Research Engineer',
    advisors: [{ name: 'David Lo', url: 'http://www.mysmu.edu/faculty/davidlo/' }],
    when: 'Mar 2026 — present',
    lane: 0,
  },
  {
    org: 'NLP Lab, University of California, Merced',
    logo: 'ucmerced.png',
    mark: 'UCM',
    role: 'Research Intern',
    advisors: [{ name: 'Yiwei Wang', url: 'https://wangywust.github.io/' }],
    when: 'Jun 2025 — Apr 2026',
    lane: 1,
    merged: true,
  },
  {
    org: 'AGI Lab, Westlake University',
    logo: 'westlake.png',
    mark: 'WU',
    role: 'Visiting Student and Research Assistant',
    advisors: [{ name: 'Chi Zhang', url: 'https://icoz69.github.io/' }],
    when: 'Nov 2024 — Feb 2026',
    lane: 0,
  },
  {
    org: 'Henan University',
    logo: 'henu.png',
    mark: 'HU',
    role: 'B.Eng. in Software Engineering',
    advisors: [{ name: 'Xiaoke Zhu', url: 'https://cs.henu.edu.cn/info/1273/5571.htm' }],
    when: 'Sep 2021 — Jun 2025',
    lane: 0,
  },
];
