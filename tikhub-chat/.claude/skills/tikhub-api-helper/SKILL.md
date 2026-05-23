---
name: tikhub-api-helper
description: Search and query TikHub APIs for TikTok, Douyin, Xiaohongshu, Lemon8, Instagram, YouTube, Twitter, Reddit, and more. Use when user asks about  needs to fetch data from social media platforms. Supports both English and Chinese queries.
---

# TikHub API Helper

A skill to help users search, find, and call TikHub API endpoints for social media data.

## Important Rules

1. **NEVER write test/debug scripts in this directory**. If you need to test, call `api_client.py` directly via Bash. Do not create `.py` files.
2. **Use `api_searcher.py detail:OPERATION_ID` to check parameters** before calling any API. Parameter names vary between endpoints.
3. **If an API returns 400, check the error message** — it often tells you the correct endpoint to migrate to.
4. **Do NOT use `WebSearch` or `WebFetch` as fallback** unless TikHub genuinely has no API for that platform/data. Always try TikHub API first.

## Quick Start

When a user asks about TikHub API or wants to fetch social media data:

1. **Search for relevant APIs** using the searcher script
2. **Check parameters** with `detail:OPERATION_ID`
3. **Call the API** with `api_client.py`
4. **Return formatted results** to the user

## Verified API Endpoints (常用已验证接口)

These endpoints are tested and known to work. Use these as the first choice.

### 小红书 (Xiaohongshu)

| Action | Method | Endpoint | Key Params |
|--------|--------|----------|------------|
| 搜索笔记 | GET | `/api/v1/xiaohongshu/app/search_notes` | `keyword` (required), `page` (required, from 1) |
| 热榜 | GET | `/api/v1/xiaohongshu/web_v2/fetch_hot_list` | (none) |
| 推荐笔记 | GET | `/api/v1/xiaohongshu/web_v2/fetch_feed_notes_v2` | (none) |

**WARNING**: `xiaohongshu/web/search_notes` is **deprecated**. Use `xiaohongshu/app/search_notes` instead.
**WARNING**: `xiaohongshu/web_v2/fetch_search_notes` uses param `keywords` (plural) but may return 400. Prefer `xiaohongshu/app/search_notes`.

### 抖音 (Douyin)

| Action | Method | Endpoint | Key Params |
|--------|--------|----------|------------|
| 搜索视频 | GET | `/api/v1/douyin/web/fetch_video_search_result` | `keyword` (required), `offset`, `count` |
| 综合搜索 | GET | `/api/v1/douyin/web/fetch_general_search_result` | `keyword` (required), `offset`, `count` |
| 热搜榜 | GET | `/api/v1/douyin/app/v3/fetch_hot_search_list` | `board_type`, `board_sub_type` |
| 热门视频 | GET | `/api/v1/douyin/web/fetch_trending_post` | (none) |

### 微博 (Weibo)

| Action | Method | Endpoint | Key Params |
|--------|--------|----------|------------|
| 搜索 | GET | `/api/v1/weibo/web/fetch_search` | `keyword` (required), `page`, `search_type` (1=综合, 61=实时, 60=热门) |
| 热搜 | GET | `/api/v1/weibo/web/fetch_hot_search` | (none) |

### B站 (Bilibili)

| Action | Method | Endpoint | Key Params |
|--------|--------|----------|------------|
| 综合搜索 | GET | `/api/v1/bilibili/web/fetch_general_search` | `keyword`, `order` (required), `page`, `page_size` (required) |
| 热搜 | GET | `/api/v1/bilibili/web/fetch_hot_search` | `limit` (required) |

### TikTok

| Action | Method | Endpoint | Key Params |
|--------|--------|----------|------------|
| 探索视频 | GET | `/api/v1/tiktok/web/fetch_explore_post` | (none) |
| 热门视频 | GET | `/api/v1/tiktok/web/fetch_trending_post` | (none) |
| 搜索视频 | GET | `/api/v1/tiktok/web/fetch_search_video` | `keyword` (required) |

## Available Scripts

### API Searcher - `api_searcher.py`

Search and find relevant TikHub API endpoints.

```bash
# Search by keyword
python api_searcher.py "user profile"
python api_searcher.py "视频评论"
python api_searcher.py "trending"

# List all APIs for a specific tag/category
python api_searcher.py tag:TikTok-Web-API
python api_searcher.py tag:Douyin-App-V3-API
python api_searcher.py tag:Xiaohongshu-App-API

# List popular/common APIs
python api_searcher.py popular

# List all available tags/categories
python api_searcher.py tags

# Get detailed info for a specific API
python api_searcher.py detail:tiktok_web_fetch_user_profile_get
```

### API Client - `api_client.py`

Make HTTP requests to TikHub API endpoints. Defaults to China domain (`api.tikhub.dev`).

```bash
# Health check
python api_client.py GET /api/v1/health/check

# 小红书搜索笔记 (注意：必须用 app 接口，web 接口已弃用)
python api_client.py GET /api/v1/xiaohongshu/app/search_notes "keyword=美食" "page=1"

# 小红书热榜
python api_client.py GET /api/v1/xiaohongshu/web_v2/fetch_hot_list

# 抖音搜索视频
python api_client.py GET /api/v1/douyin/web/fetch_video_search_result "keyword=游戏" "offset=0" "count=10"

# 微博热搜
python api_client.py GET /api/v1/weibo/web/fetch_hot_search

# POST request with JSON body
python api_client.py POST /api/v1/tiktok/web/generate_xgnarly '{"url": "https://..."}'
```

## Supported Platforms

Use `python api_searcher.py tags` to see all categories.

## Common Use Cases

### Search Xiaohongshu Notes

```bash
# Step 1: Search (use APP API, not Web)
python api_client.py GET /api/v1/xiaohongshu/app/search_notes "keyword=美食探店" "page=1"
```

### Get Hot/Trending Content

```bash
# 小红书热榜
python api_client.py GET /api/v1/xiaohongshu/web_v2/fetch_hot_list

# 抖音热搜
python api_client.py GET /api/v1/douyin/app/v3/fetch_hot_search_list

# 微博热搜
python api_client.py GET /api/v1/weibo/web/fetch_hot_search

# B站热搜
python api_client.py GET /api/v1/bilibili/web/fetch_hot_search "limit=10"
```

### Cross-Platform Search

```bash
# Search keyword across multiple platforms
python api_client.py GET /api/v1/xiaohongshu/app/search_notes "keyword=关键词" "page=1"
python api_client.py GET /api/v1/douyin/web/fetch_video_search_result "keyword=关键词" "offset=0" "count=10"
python api_client.py GET /api/v1/weibo/web/fetch_search "keyword=关键词" "page=1"
```

## Authentication

API requests use a default token for development. For production use, users should:

1. Get their API token from [TikHub User](https://www.tikhub.io)
2. Set the `TIKHUB_TOKEN` environment variable
3. Or modify `DEFAULT_TOKEN` in `api_client.py`

## Base URLs

- **China users (default)**: `https://api.tikhub.dev` — 无需代理，中国大陆直连
- **International**: `https://api.tikhub.io`

The API client defaults to China domain (`api.tikhub.dev`). To use the international domain, set `use_china_domain=False`.

## Rate Limits

- **QPS**: 10 requests per second per endpoint
- **Timeout**: 30-60 seconds

## Instructions for Claude

When helping users with TikHub API:

1. **Check "Verified API Endpoints" table first** — use known-working endpoints before searching
2. **Search for APIs** — Use `api_searcher.py` if the table doesn't cover the need
3. **Check parameters** — Always use `detail:OPERATION_ID` to verify required params
4. **Make the request** — Use `api_client.py`
5. **Format results** — Present the API response clearly

### Example Workflow

User: "搜索小红书美食笔记"

```bash
# Use verified endpoint directly (no need to search)
python api_client.py GET /api/v1/xiaohongshu/app/search_notes "keyword=美食" "page=1"
```

User: "TikTok 用户信息"

```bash
# Search first since not in verified table
python api_searcher.py "tiktok user profile"
# Then check params
python api_searcher.py detail:tiktok_web_fetch_user_profile_get
# Then call
python api_client.py GET /api/v1/tiktok/web/fetch_user_profile "sec_user_id=MS4wLjABAAAA..."
```

## Error Handling

| Error | Solution |
|-------|----------|
| `401 Unauthorized` | Check API token is valid |
| `400 deprecated` | Check error message for the migration endpoint |
| `400 Bad Request` | Check parameter names and values, use `detail:OPERATION_ID` |
| `429 Too Many Requests` | Rate limit exceeded, wait before retry |
| `Connection error` | Check network, default domain is `api.tikhub.dev` (China) |

## Reference

- **Full API Documentation**: [TikHub API Docs](https://api.tikhub.io)
- **Apifox Docs**: [docs.tikhub.io](https://docs.tikhub.io)
- **API Status**: [monitor.tikhub.io](https://monitor.tikhub.io)
- **GitHub**: [github.com/TikHub](https://github.com/TikHub)
