// 根據權重隨機選擇回應的共用工具函數
export function selectByWeight<T>(responses: Array<{ response: T; weight: number }>): T {
  const totalWeight = responses.reduce((sum, item) => sum + item.weight, 0);
  let random = Math.random() * totalWeight;
  
  let selectedResponse = responses[0].response;
  for (const item of responses) {
    random -= item.weight;
    if (random <= 0) {
      selectedResponse = item.response;
      break;
    }
  }
  
  return selectedResponse;
}
