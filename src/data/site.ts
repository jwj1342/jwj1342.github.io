/** Site-wide copy and links. Edit here; pages read from this file. */
export const site = {
  name: 'Wenjia Jiang',
  title: 'Wenjia Jiang',
  description:
    'Wenjia Jiang — incoming Ph.D. student at the University of Alberta and Research Engineer at Singapore Management University, building LLM-based code agents.',
  url: 'https://wenjia.me',
  email: 'jwj57920@gmail.com',
  /** Hero headline; the part in `emphasis` is set in accent italic. */
  headline: { lead: 'Building code agents for', emphasis: 'the real world.' },
  /** `call` is how the link is written on the homepage, as an agent tool call. */
  links: [
    { label: 'Google Scholar', call: 'scholar.open()', href: 'https://scholar.google.com/citations?user=kljYVvoAAAAJ' },
    { label: 'GitHub', call: 'github.pull()', href: 'https://github.com/jwj1342' },
    { label: 'LinkedIn', call: 'linkedin.link()', href: 'https://www.linkedin.com/in/wenjia-jiang-223623260' },
  ],
  cv: '/files/CV_Wenjia_Jiang.pdf',
  /** Public base URL of the R2 bucket that stores photos. */
  photosBase: 'https://photos.wenjia.me',
};

export const nav = [
  { label: 'About', href: '/' },
  { label: 'Publications', href: '/publications/' },
  { label: 'Blog', href: '/blog/' },
  { label: 'Photos', href: '/photos/' },
  { label: 'Misc', href: '/misc/' },
  { label: 'CV', href: site.cv, external: true },
];
