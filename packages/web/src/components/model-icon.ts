export type ModelIconType =
  | 'gpt'
  | 'claude'
  | 'gemini'
  | 'qwen'
  | 'deepseek'
  | 'hunyuan'
  | 'doubao'
  | 'glm'
  | 'llama'
  | 'mistral'
  | 'kimi'
  | 'ernie'
  | 'generic';

export function groupKeyFromModelName(name: string): string {
  const firstSegment = name.split('-')[0]?.trim().toLowerCase();
  return firstSegment || 'other';
}

export function resolveModelIconType(groupKey: string): ModelIconType {
  const key = groupKey.toLowerCase();
  if (key.includes('gpt')) return 'gpt';
  if (key.includes('claude')) return 'claude';
  if (key.includes('gemini')) return 'gemini';
  if (key.includes('qwen')) return 'qwen';
  if (key.includes('deepseek')) return 'deepseek';
  if (key.includes('hunyuan')) return 'hunyuan';
  if (key.includes('doubao')) return 'doubao';
  if (key.includes('chatglm') || key.includes('glm')) return 'glm';
  if (key.includes('llama')) return 'llama';
  if (key.includes('mistral')) return 'mistral';
  if (key.includes('moonshot') || key.includes('kimi')) return 'kimi';
  if (key.includes('ernie') || key.includes('wenxin')) return 'ernie';
  return 'generic';
}

export function modelIconVisual(iconType: ModelIconType): { label: string; imageSrc: string } {
  switch (iconType) {
    case 'gpt':
      return { label: 'OpenAI', imageSrc: '/avatars/gpt52.png' };
    case 'claude':
      return { label: 'Anthropic', imageSrc: '/avatars/sonnet.png' };
    case 'gemini':
      return { label: 'Google', imageSrc: '/avatars/gemini.png' };
    case 'qwen':
      return { label: 'Alibaba', imageSrc: '/images/qwen.svg' };
    case 'deepseek':
      return { label: 'DeepSeek', imageSrc: '/images/deepseek.svg' };
    case 'hunyuan':
      return { label: 'Tencent', imageSrc: '/avatars/assistant.svg' };
    case 'doubao':
      return { label: 'ByteDance', imageSrc: '/avatars/assistant.svg' };
    case 'glm':
      return { label: 'Zhipu', imageSrc: '/images/zhipu.svg' };
    case 'llama':
      return { label: 'Meta', imageSrc: '/avatars/assistant.svg' };
    case 'mistral':
      return { label: 'Mistral', imageSrc: '/avatars/assistant.svg' };
    case 'kimi':
      return { label: 'Moonshot', imageSrc: '/images/kimi.svg' };
    case 'ernie':
      return { label: 'Baidu', imageSrc: '/avatars/assistant.svg' };
    default:
      return { label: 'General', imageSrc: '/avatars/assistant.svg' };
  }
}
