/**
 * Pop Cat: the chat assistant in the bottom-left corner. It is a small language model
 * that runs entirely in the visitor's browser (WebLLM on WebGPU): no AI server, no API key.
 * The questions visitors ask and the answers are logged (src/scripts/track.ts), and the
 * chat panel says so.
 * Nothing is downloaded until the visitor sends their first question.
 *
 * What the cat knows about you is not written here: it is put together from the rest of
 * the site's data (site.ts, career.ts, publications, achievements.ts) at build time, in
 * src/pages/chat-profile.json.ts. Add anything else it should know to `extraFacts`.
 */
export const popcat = {
  /**
   * The model, by its WebLLM id (see `prebuiltAppConfig.model_list` in @mlc-ai/web-llm).
   * `id` needs a GPU with 16-bit float shaders; `fallbackId` is the same model for GPUs
   * without them. `size` is the download, shown to the visitor before it starts.
   *
   * `host` is where the weights are downloaded from: our own R2 bucket, so that the
   * download works the same everywhere (Hugging Face, the default, is unreachable from
   * mainland China). The bucket must hold a copy of each model at
   * <host>/<id>/resolve/main/ and its library at <host>/libs/<version>/<file>.wasm.
   * Set `host` to '' to download from Hugging Face instead.
   *
   * To try any other model without editing this file, open a page with
   * ?popcat-model=<WebLLM model id> added to its address (that one comes from Hugging Face).
   */
  model: {
    id: 'Qwen3.5-0.8B-q4f16_1-MLC',
    fallbackId: 'Qwen3.5-0.8B-q4f32_1-MLC',
    label: 'Qwen3.5 0.8B',
    size: '430 MB',
    host: 'https://models.wenjia.me',
  },
  /**
   * The model for phones and tablets: at present the same one as on computers. It needs
   * about 1.6 GB of graphics memory, which some phones will not give a web page; the
   * cat then says so instead of answering. For a lighter one, a copy of Qwen2.5 0.5B
   * (under 1 GB of memory, weaker answers) is already in the bucket:
   *   id: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC', fallbackId: 'Qwen2.5-0.5B-Instruct-q4f32_1-MLC',
   *   label: 'Qwen2.5 0.5B', size: '280 MB'
   */
  phoneModel: {
    id: 'Qwen3.5-0.8B-q4f16_1-MLC',
    fallbackId: 'Qwen3.5-0.8B-q4f32_1-MLC',
    label: 'Qwen3.5 0.8B',
    size: '430 MB',
  },
  /**
   * How the cat should refer to you, for example 'he/him' or 'she/her'. Left empty, the
   * cat is told to use your name only, but small models often guess a pronoun anyway.
   */
  pronouns: '',
  /**
   * What the cat says at the end of every sentence: `en` after English, `zh` after
   * Chinese. Set either to '' for a cat that just talks in that language.
   */
  meow: { en: 'meow', zh: '喵' },
  /**
   * The cat's first words. `download` is said only to visitors who do not have the model
   * yet; {size} becomes the model's size. The interface is in English for everyone; the
   * cat still answers a Chinese question in Chinese.
   */
  greeting: {
    hello: "Hi! I'm Pop Cat, a small model that runs right in your browser.",
    download: 'Your first question downloads me once ({size}).',
    /** An optional closing line, such as an invitation to ask something. Empty: say nothing more. */
    ask: '',
  },
  /** One-tap questions under the greeting: `label` is on the button, `ask` is what gets sent. */
  chips: [
    { label: 'Research', ask: 'What does Wenjia work on?' },
    { label: 'Papers', ask: 'Summarise the main papers' },
    { label: 'Career', ask: 'Where has Wenjia studied and worked?' },
    { label: 'About you', ask: 'How are you running in my browser?' },
  ],
  /** Extra facts for the cat, one per line: hobbies, favourite things, anything not elsewhere on the site. */
  extraFacts: [
    'Wenjia likes the paintings of Claude Monet; the colours of this website come from "Impression, Sunrise".',
    'Wenjia takes photographs; some are on the Photos page of this site.',
  ],
};
