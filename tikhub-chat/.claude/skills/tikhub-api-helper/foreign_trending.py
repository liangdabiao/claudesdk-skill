#!/usr/bin/env python3
"""
Fetch trending/hot content from foreign social media platforms via TikHub API.
"""
import json
import sys
sys.path.insert(0, 'D:/claudesdk-test/tikhub-chat/.claude/skills/tikhub-api-helper')
from api_client import TikHubAPIClient

client = TikHubAPIClient(use_china_domain=False)  # Use international domain for foreign platforms

# 1. Twitter Trending
print("="*70)
print("🐦 1. Twitter - Trending Topics")
print("="*70)
try:
    r = client.get('/api/v1/twitter/web/fetch_trending')
    data_str = json.dumps(r, indent=2, ensure_ascii=False)
    print(data_str[:5000])
except Exception as e:
    print(f"Error: {e}")

# 2. Reddit Popular Feed
print("\n" + "="*70)
print("🤖 2. Reddit - Popular Feed")
print("="*70)
try:
    r = client.get('/api/v1/reddit/app/fetch_popular_feed')
    data_str = json.dumps(r, indent=2, ensure_ascii=False)
    print(data_str[:5000])
except Exception as e:
    print(f"Error: {e}")

# 3. Reddit News Feed
print("\n" + "="*70)
print("🤖 3. Reddit - News Feed")
print("="*70)
try:
    r = client.get('/api/v1/reddit/app/fetch_news_feed')
    data_str = json.dumps(r, indent=2, ensure_ascii=False)
    print(data_str[:5000])
except Exception as e:
    print(f"Error: {e}")

# 4. Reddit Trending Searches
print("\n" + "="*70)
print("🤖 4. Reddit - Trending Searches")
print("="*70)
try:
    r = client.get('/api/v1/reddit/app/fetch_trending_searches')
    data_str = json.dumps(r, indent=2, ensure_ascii=False)
    print(data_str[:5000])
except Exception as e:
    print(f"Error: {e}")

# 5. YouTube Trending Videos
print("\n" + "="*70)
print("📺 5. YouTube - Trending Videos")
print("="*70)
try:
    r = client.get('/api/v1/youtube/web/get_trending_videos')
    data_str = json.dumps(r, indent=2, ensure_ascii=False)
    print(data_str[:5000])
except Exception as e:
    print(f"Error: {e}")

# 6. TikTok Explore
print("\n" + "="*70)
print("🎵 6. TikTok - Explore (Trending)")
print("="*70)
try:
    r = client.get('/api/v1/tiktok/web/fetch_explore_post')
    data_str = json.dumps(r, indent=2, ensure_ascii=False)
    print(data_str[:5000])
except Exception as e:
    print(f"Error: {e}")
