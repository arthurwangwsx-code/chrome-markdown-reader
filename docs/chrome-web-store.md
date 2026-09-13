# Chrome Web Store 发布

项目使用 Chrome Web Store API **V2** 自动化后续版本上传与提交审核。

## 一次性人工步骤

V2 API 不支持创建第一个 Store item，因此首次需要在 Developer Dashboard 创建条目，并完成 Store listing 与 Privacy。Google 账号需要开启两步验证。完成后记录 Publisher ID 与 Extension ID。

在 Google Cloud 中启用 Chrome Web Store API，创建 OAuth Client，并取得带 `https://www.googleapis.com/auth/chromewebstore` scope 的 refresh token。仓库的 `chrome-web-store` GitHub Environment 配置以下 secrets：

- `CWS_CLIENT_ID`
- `CWS_CLIENT_SECRET`
- `CWS_REFRESH_TOKEN`
- `CWS_PUBLISHER_ID`
- `CWS_EXTENSION_ID`

## 自动化

本地可运行：

```sh
npm run store:status
npm run store:upload
npm run store:publish
```

GitHub Actions 的 `Chrome Web Store` workflow 默认只上传；只有手工触发且明确选择 `publish=true` 才提交审核。发布仍遵循商店已有 visibility 设置。

当前没有把任何 OAuth 凭证提交到仓库。首次 Store item 尚未存在时，自动化会保持待配置状态，不回退到即将淘汰的 V1 create API。

官方依据：

- https://developer.chrome.com/docs/webstore/using-api
- https://developer.chrome.com/docs/webstore/api/reference/rest
- https://developer.chrome.com/blog/cws-api-v2
