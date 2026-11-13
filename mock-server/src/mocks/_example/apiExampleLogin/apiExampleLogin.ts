import { http, HttpResponse } from 'msw'
import authenticated from './authenticated.json'
import unauthenticated from './unauthenticated.json'
import latestResponse from './latest.json';
import { apiExperimentConfig } from '../_config';

// 進階範例：POST /api/Example/Login，依 _config.ts 的開關切換回應。
// 這裡不驗證帳密；token 是假字串，不是真的 JWT。
export const apiExampleLoginHandler = [
  http.post('/Example/Login', async () => {
    if (apiExperimentConfig.useLatestResponse) {
      return HttpResponse.json(latestResponse);
    }
    return HttpResponse.json(
      apiExperimentConfig.user.isAuthenticated ? authenticated : unauthenticated,
    );
  })
]
