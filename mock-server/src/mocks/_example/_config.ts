// 範例專案設定。每個 project 自管設定，shape 不必跟其他 project 一致。
export const apiExperimentConfig = {
  useLatestResponse: false,
  recordingBlacklist: [] as string[],
  user: {
    isAuthenticated: true, // 改成 false 可測登入失敗分支
  },
};
