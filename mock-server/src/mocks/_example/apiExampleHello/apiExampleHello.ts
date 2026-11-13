import { http, HttpResponse } from 'msw'
import apiExampleHelloResponse from './normal.json'
import latestResponse from './latest.json';
import { apiExperimentConfig } from '../_config';

// 最簡單的 handler：GET /api/Example/Hello（資料夾名 = URL 去斜線，保留大小寫）
export const apiExampleHelloHandler = [
  http.get('/Example/Hello', () => {
    if (apiExperimentConfig.useLatestResponse) {
      return HttpResponse.json(latestResponse);
    }
    return HttpResponse.json(apiExampleHelloResponse);
  })
]
