// lib/admin/actions-pulse.js — MoreYou Pulse: Sentiment Analysis Module
import { supabase } from '@/lib/supabase';
import { randomUUID } from 'crypto';

// ── Helpers ──
function paginate(searchParams) {
  const page = Math.max(1, parseInt(searchParams?.get?.('page') || '1', 10));
  const limit = Math.min(parseInt(searchParams?.get?.('limit') || '20', 10), 200);
  const from = (page - 1) * limit;
  const to = from + limit - 1;
  return { page, limit, from, to };
}

// Hash generator for deduplication
function generateDedupHash(content, url) {
  const combined = `${content}${url}`;
  // Simple hash: create a base64 digest using crypto functions available in Node
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(combined).digest('hex');
}

// ══════════════════════════════════════════════════════
// GET ACTIONS
// ══════════════════════════════════════════════════════
export async function handlePulseGetAction(action, searchParams) {
  switch (action) {

    // ── Dashboard Stats ──
    case 'pulse_dashboard': {
      // Total posts
      const { count: totalPosts } = await supabase.from('pulse_posts')
        .select('*', { count: 'exact', head: true });

      // Sentiment breakdown
      const { data: sentimentData } = await supabase.from('pulse_sentiments')
        .select('sentiment');
      const sentimentBreakdown = {
        positive: sentimentData?.filter(s => s.sentiment === 'positive').length || 0,
        negative: sentimentData?.filter(s => s.sentiment === 'negative').length || 0,
        neutral: sentimentData?.filter(s => s.sentiment === 'neutral').length || 0,
      };

      // Top topics
      const { data: topTopics } = await supabase.from('pulse_topics')
        .select('name, post_count')
        .order('post_count', { ascending: false })
        .limit(5);

      // Recent alerts
      const { data: recentAlerts } = await supabase.from('pulse_alert_triggers')
        .select('*')
        .order('triggered_at', { ascending: false })
        .limit(10);

      // Posts per source type
      const { data: sourceStats } = await supabase.from('pulse_posts')
        .select('source_type');
      const postsPerSource = {};
      sourceStats?.forEach(s => {
        postsPerSource[s.source_type] = (postsPerSource[s.source_type] || 0) + 1;
      });

      // Tenant info
      const { count: tenantCount } = await supabase.from('pulse_tenants')
        .select('*', { count: 'exact', head: true });

      // Calculate percentages
      const totalSent = sentimentBreakdown.positive + sentimentBreakdown.negative + sentimentBreakdown.neutral;
      const positivePct = totalSent > 0 ? Math.round((sentimentBreakdown.positive / totalSent) * 100) : 0;
      const negativePct = totalSent > 0 ? Math.round((sentimentBreakdown.negative / totalSent) * 100) : 0;

      // Count topics
      const { count: topicCount } = await supabase.from('pulse_topics')
        .select('*', { count: 'exact', head: true });

      return Response.json({
        total_posts: totalPosts || 0,
        positive_pct: positivePct,
        negative_pct: negativePct,
        topic_count: topicCount || 0,
        sentiment_breakdown: sentimentBreakdown,
        top_topics: topTopics || [],
        recent_alerts: recentAlerts || [],
        sources: postsPerSource,
        tenant_count: tenantCount || 0,
      });
    }

    // ── Tenants List ──
    case 'pulse_tenants': {
      const { page, limit, from, to } = paginate(searchParams);
      const search = searchParams.get('search') || '';

      let query = supabase.from('pulse_tenants')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false });

      if (search) {
        query = query.or(`name.ilike.%${search}%,org_id.ilike.%${search}%`);
      }

      const { data, count, error } = await query.range(from, to);
      if (error) return Response.json({ error: error.message }, { status: 500 });

      return Response.json({ tenants: data || [], total: count || 0, page, limit });
    }

    // ── Posts List ──
    case 'pulse_posts': {
      const { page, limit, from, to } = paginate(searchParams);
      const tenantId = searchParams.get('tenant_id') || '';
      const sourceType = searchParams.get('source_type') || '';
      const sentiment = searchParams.get('sentiment') || '';
      const search = searchParams.get('search') || '';
      const dateFrom = searchParams.get('date_from') || '';
      const dateTo = searchParams.get('date_to') || '';

      let query = supabase.from('pulse_posts')
        .select('*, sentiment:pulse_sentiments(*)', { count: 'exact' })
        .order('created_at', { ascending: false });

      if (tenantId) query = query.eq('tenant_id', tenantId);
      if (sourceType) query = query.eq('source_type', sourceType);
      if (sentiment) {
        // Join with sentiments and filter by sentiment value
        // For now, apply client-side filter after fetch
      }
      if (search) {
        query = query.or(`title.ilike.%${search}%,content.ilike.%${search}%`);
      }
      if (dateFrom) {
        query = query.gte('created_at', dateFrom);
      }
      if (dateTo) {
        query = query.lte('created_at', dateTo);
      }

      const { data, count, error } = await query.range(from, to);
      if (error) return Response.json({ error: error.message }, { status: 500 });

      // Client-side sentiment filter if needed
      let filtered = data || [];
      if (sentiment) {
        filtered = filtered.filter(p => p.sentiment?.[0]?.sentiment === sentiment);
      }

      return Response.json({ posts: filtered, total: count || 0, page, limit });
    }

    // ── Sentiments List ──
    case 'pulse_sentiments': {
      const { page, limit, from, to } = paginate(searchParams);
      const sentiment = searchParams.get('sentiment') || '';

      let query = supabase.from('pulse_sentiments')
        .select('*, post:pulse_posts(*)', { count: 'exact' })
        .order('created_at', { ascending: false });

      if (sentiment) query = query.eq('sentiment', sentiment);

      const { data, count, error } = await query.range(from, to);
      if (error) return Response.json({ error: error.message }, { status: 500 });

      return Response.json({ sentiments: data || [], total: count || 0, page, limit });
    }

    // ── Topics List ──
    case 'pulse_topics': {
      const { page, limit, from, to } = paginate(searchParams);
      const trending = searchParams.get('trending') === 'true';

      let query = supabase.from('pulse_topics')
        .select('*', { count: 'exact' });

      if (trending) {
        query = query.order('post_count', { ascending: false });
      } else {
        query = query.order('created_at', { ascending: false });
      }

      const { data, count, error } = await query.range(from, to);
      if (error) return Response.json({ error: error.message }, { status: 500 });

      return Response.json({ topics: data || [], total: count || 0, page, limit });
    }

    // ── Alert Rules ──
    case 'pulse_alerts': {
      const { page, limit, from, to } = paginate(searchParams);
      const tenantId = searchParams.get('tenant_id') || '';

      let query = supabase.from('pulse_alert_rules')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false });

      if (tenantId) query = query.eq('tenant_id', tenantId);

      const { data, count, error } = await query.range(from, to);
      if (error) return Response.json({ error: error.message }, { status: 500 });

      return Response.json({ alerts: data || [], total: count || 0, page, limit });
    }

    // ── Data Sources ──
    case 'pulse_data_sources': {
      const { page, limit, from, to } = paginate(searchParams);
      const tenantId = searchParams.get('tenant_id') || '';

      let query = supabase.from('pulse_data_sources')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false });

      if (tenantId) query = query.eq('tenant_id', tenantId);

      const { data, count, error } = await query.range(from, to);
      if (error) return Response.json({ error: error.message }, { status: 500 });

      return Response.json({ sources: data || [], total: count || 0, page, limit });
    }

    // ── Industry Lexicons ──
    case 'pulse_lexicons': {
      const { page, limit, from, to } = paginate(searchParams);
      const industry = searchParams.get('industry') || '';
      const category = searchParams.get('category') || '';

      let query = supabase.from('pulse_lexicons')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false });

      if (industry) query = query.eq('industry', industry);
      if (category) query = query.eq('category', category);

      const { data, count, error } = await query.range(from, to);
      if (error) return Response.json({ error: error.message }, { status: 500 });

      return Response.json({ lexicons: data || [], total: count || 0, page, limit });
    }

    // ── Single Post Detail ──
    case 'pulse_post_detail': {
      const id = searchParams.get('id');
      if (!id) return Response.json({ error: 'Missing id' }, { status: 400 });

      const { data: post, error } = await supabase.from('pulse_posts')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (error) return Response.json({ error: error.message }, { status: 500 });
      if (!post) return Response.json({ error: 'Post not found' }, { status: 404 });

      const { data: sentiment } = await supabase.from('pulse_sentiments')
        .select('*')
        .eq('post_id', id)
        .maybeSingle();

      return Response.json({ post, sentiment: sentiment || null });
    }

    // ── Volume Trend (Last 30 Days) ──
    case 'pulse_volume_trend': {
      const { data, error } = await supabase.from('pulse_posts')
        .select('created_at');
      if (error) return Response.json({ error: error.message }, { status: 500 });

      // Group by day
      const trends = {};
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      data?.forEach(post => {
        const date = new Date(post.created_at).toISOString().split('T')[0];
        if (new Date(date) >= thirtyDaysAgo) {
          trends[date] = (trends[date] || 0) + 1;
        }
      });

      // Get sentiment breakdown per day
      const { data: sentiments } = await supabase.from('pulse_sentiments')
        .select('created_at, sentiment, post:pulse_posts(created_at)');

      const sentimentPerDay = {};
      sentiments?.forEach(s => {
        const date = new Date(s.post?.created_at || s.created_at).toISOString().split('T')[0];
        if (new Date(date) >= thirtyDaysAgo) {
          if (!sentimentPerDay[date]) {
            sentimentPerDay[date] = { positive: 0, negative: 0, neutral: 0 };
          }
          sentimentPerDay[date][s.sentiment] = (sentimentPerDay[date][s.sentiment] || 0) + 1;
        }
      });

      // Convert to array sorted by date for frontend chart
      const trendArray = Object.entries(trends)
        .map(([date, count]) => ({ date, count }))
        .sort((a, b) => a.date.localeCompare(b.date));

      return Response.json(trendArray);
    }

    // ── Alert History ──
    case 'pulse_alert_history': {
      const limit = Math.min(parseInt(searchParams?.get?.('limit') || '10', 10), 100);
      const { data, error } = await supabase.from('pulse_alert_triggers')
        .select('*')
        .order('triggered_at', { ascending: false })
        .limit(limit);
      if (error) return Response.json({ error: error.message }, { status: 500 });
      return Response.json({ history: data || [] });
    }

    // ── Source Stats ──
    case 'pulse_source_stats': {
      const tenantId = searchParams.get('tenant_id');
      if (!tenantId) return Response.json({ error: 'Missing tenant_id' }, { status: 400 });

      const { data, error } = await supabase.from('pulse_posts')
        .select('source_type')
        .eq('tenant_id', tenantId);
      if (error) return Response.json({ error: error.message }, { status: 500 });

      const stats = {};
      data?.forEach(p => {
        stats[p.source_type] = (stats[p.source_type] || 0) + 1;
      });

      return Response.json({ stats });
    }

    default:
      return null;
  }
}

// ══════════════════════════════════════════════════════
// POST ACTIONS
// ══════════════════════════════════════════════════════
export async function handlePulsePostAction(action, body) {
  switch (action) {

    // ── Upsert Tenant ──
    case 'pulse_upsert_tenant': {
      const { id, name, org_id } = body;

      if (!name || !org_id) {
        return Response.json({ error: 'Missing name or org_id' }, { status: 400 });
      }

      let payload = { name, org_id, updated_at: new Date().toISOString() };

      if (id) {
        // Update existing
        const { data, error } = await supabase.from('pulse_tenants')
          .update(payload)
          .eq('id', id)
          .select();
        if (error) return Response.json({ error: error.message }, { status: 500 });
        return Response.json({ tenant: data?.[0] || null });
      } else {
        // Create new with api_key
        payload.id = randomUUID();
        payload.api_key = randomUUID();
        payload.created_at = new Date().toISOString();

        const { data, error } = await supabase.from('pulse_tenants')
          .insert(payload)
          .select();
        if (error) return Response.json({ error: error.message }, { status: 500 });
        return Response.json({ tenant: data?.[0] || null });
      }
    }

    // ── Upsert Data Source ──
    case 'pulse_upsert_source': {
      const { id, tenant_id, name, source_type, url, config } = body;

      if (!tenant_id || !name || !source_type) {
        return Response.json({ error: 'Missing tenant_id, name, or source_type' }, { status: 400 });
      }

      let payload = { tenant_id, name, source_type, url, config, updated_at: new Date().toISOString() };

      if (id) {
        const { data, error } = await supabase.from('pulse_data_sources')
          .update(payload)
          .eq('id', id)
          .select();
        if (error) return Response.json({ error: error.message }, { status: 500 });
        return Response.json({ source: data?.[0] || null });
      } else {
        payload.id = randomUUID();
        payload.created_at = new Date().toISOString();

        const { data, error } = await supabase.from('pulse_data_sources')
          .insert(payload)
          .select();
        if (error) return Response.json({ error: error.message }, { status: 500 });
        return Response.json({ source: data?.[0] || null });
      }
    }

    // ── Create Post ──
    case 'pulse_create_post': {
      const { tenant_id, source_type, title, content, url, source_id } = body;

      if (!tenant_id || !source_type || !content) {
        return Response.json({ error: 'Missing tenant_id, source_type, or content' }, { status: 400 });
      }

      const postId = randomUUID();
      const dedupHash = generateDedupHash(content, url || '');

      const payload = {
        id: postId,
        tenant_id,
        source_type,
        title: title || null,
        content,
        url: url || null,
        source_id: source_id || null,
        dedup_hash: dedupHash,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await supabase.from('pulse_posts')
        .insert(payload)
        .select();
      if (error) return Response.json({ error: error.message }, { status: 500 });

      return Response.json({ post: data?.[0] || null });
    }

    // ── Create Sentiment ──
    case 'pulse_create_sentiment': {
      const { post_id, sentiment, confidence, keywords } = body;

      if (!post_id || !sentiment) {
        return Response.json({ error: 'Missing post_id or sentiment' }, { status: 400 });
      }

      const sentimentId = randomUUID();

      const payload = {
        id: sentimentId,
        post_id,
        sentiment,
        confidence: confidence || 0,
        keywords: keywords || [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await supabase.from('pulse_sentiments')
        .insert(payload)
        .select();
      if (error) return Response.json({ error: error.message }, { status: 500 });

      return Response.json({ sentiment: data?.[0] || null });
    }

    // ── Upsert Topic ──
    case 'pulse_upsert_topic': {
      const { id, tenant_id, name, post_count } = body;

      if (!tenant_id || !name) {
        return Response.json({ error: 'Missing tenant_id or name' }, { status: 400 });
      }

      let payload = { tenant_id, name, post_count: post_count || 0, updated_at: new Date().toISOString() };

      if (id) {
        const { data, error } = await supabase.from('pulse_topics')
          .update(payload)
          .eq('id', id)
          .select();
        if (error) return Response.json({ error: error.message }, { status: 500 });
        return Response.json({ topic: data?.[0] || null });
      } else {
        payload.id = randomUUID();
        payload.created_at = new Date().toISOString();

        const { data, error } = await supabase.from('pulse_topics')
          .insert(payload)
          .select();
        if (error) return Response.json({ error: error.message }, { status: 500 });
        return Response.json({ topic: data?.[0] || null });
      }
    }

    // ── Upsert Alert Rule ──
    case 'pulse_upsert_alert': {
      const { id, tenant_id, name, keywords, sentiment, enabled } = body;

      if (!tenant_id || !name) {
        return Response.json({ error: 'Missing tenant_id or name' }, { status: 400 });
      }

      let payload = {
        tenant_id,
        name,
        keywords: keywords || [],
        sentiment: sentiment || null,
        enabled: enabled !== undefined ? enabled : true,
        updated_at: new Date().toISOString(),
      };

      if (id) {
        const { data, error } = await supabase.from('pulse_alert_rules')
          .update(payload)
          .eq('id', id)
          .select();
        if (error) return Response.json({ error: error.message }, { status: 500 });
        return Response.json({ alert: data?.[0] || null });
      } else {
        payload.id = randomUUID();
        payload.created_at = new Date().toISOString();

        const { data, error } = await supabase.from('pulse_alert_rules')
          .insert(payload)
          .select();
        if (error) return Response.json({ error: error.message }, { status: 500 });
        return Response.json({ alert: data?.[0] || null });
      }
    }

    // ── Upsert Lexicon ──
    case 'pulse_upsert_lexicon': {
      const { id, term, sentiment, industry, category } = body;

      if (!term || !sentiment) {
        return Response.json({ error: 'Missing term or sentiment' }, { status: 400 });
      }

      let payload = { term, sentiment, industry: industry || null, category: category || null, updated_at: new Date().toISOString() };

      if (id) {
        const { data, error } = await supabase.from('pulse_lexicons')
          .update(payload)
          .eq('id', id)
          .select();
        if (error) return Response.json({ error: error.message }, { status: 500 });
        return Response.json({ lexicon: data?.[0] || null });
      } else {
        payload.id = randomUUID();
        payload.created_at = new Date().toISOString();

        const { data, error } = await supabase.from('pulse_lexicons')
          .insert(payload)
          .select();
        if (error) return Response.json({ error: error.message }, { status: 500 });
        return Response.json({ lexicon: data?.[0] || null });
      }
    }

    // ── Delete Post ──
    case 'pulse_delete_post': {
      const { id } = body;

      if (!id) return Response.json({ error: 'Missing id' }, { status: 400 });

      const { error } = await supabase.from('pulse_posts')
        .delete()
        .eq('id', id);
      if (error) return Response.json({ error: error.message }, { status: 500 });

      return Response.json({ success: true });
    }

    // ── Delete Lexicon ──
    case 'pulse_delete_lexicon': {
      const { id } = body;

      if (!id) return Response.json({ error: 'Missing id' }, { status: 400 });

      const { error } = await supabase.from('pulse_lexicons')
        .delete()
        .eq('id', id);
      if (error) return Response.json({ error: error.message }, { status: 500 });

      return Response.json({ success: true });
    }

    // ── Batch Analyze (Mock) ──
    case 'pulse_batch_analyze': {
      const { post_ids } = body;

      if (!Array.isArray(post_ids) || post_ids.length === 0) {
        return Response.json({ error: 'post_ids must be a non-empty array' }, { status: 400 });
      }

      const sentiments = ['positive', 'negative', 'neutral'];
      const results = [];

      for (const postId of post_ids) {
        // Check if sentiment already exists
        const { data: existing } = await supabase.from('pulse_sentiments')
          .select('id')
          .eq('post_id', postId)
          .maybeSingle();

        if (!existing) {
          const randomSentiment = sentiments[Math.floor(Math.random() * sentiments.length)];
          const confidence = 0.65 + Math.random() * 0.35; // 0.65 - 1.0

          const { data, error } = await supabase.from('pulse_sentiments')
            .insert({
              id: randomUUID(),
              post_id: postId,
              sentiment: randomSentiment,
              confidence: parseFloat(confidence.toFixed(3)),
              keywords: [],
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .select();

          if (!error) {
            results.push(data?.[0] || null);
          }
        }
      }

      return Response.json({ analyzed: results.length, results });
    }

    // ── Trigger Alert Check ──
    case 'pulse_trigger_alert_check': {
      const { tenant_id } = body;

      if (!tenant_id) {
        return Response.json({ error: 'Missing tenant_id' }, { status: 400 });
      }

      // Get alert rules for this tenant
      const { data: rules } = await supabase.from('pulse_alert_rules')
        .select('*')
        .eq('tenant_id', tenant_id)
        .eq('enabled', true);

      if (!rules || rules.length === 0) {
        return Response.json({ triggered: [] });
      }

      // Get recent posts
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { data: recentPosts } = await supabase.from('pulse_posts')
        .select('*')
        .eq('tenant_id', tenant_id)
        .gte('created_at', oneHourAgo);

      const triggered = [];

      // Basic keyword matching
      rules.forEach(rule => {
        recentPosts?.forEach(post => {
          const postText = `${post.title || ''} ${post.content}`.toLowerCase();
          const keywords = rule.keywords || [];

          keywords.forEach(keyword => {
            if (postText.includes(keyword.toLowerCase())) {
              triggered.push({
                alert_rule_id: rule.id,
                post_id: post.id,
                triggered_at: new Date().toISOString(),
                reason: `Keyword match: "${keyword}"`,
              });
            }
          });
        });
      });

      // Insert triggered alerts
      if (triggered.length > 0) {
        await supabase.from('pulse_alert_triggers')
          .insert(triggered.map(t => ({ ...t, id: randomUUID() })));
      }

      return Response.json({ triggered: triggered.length, alerts: triggered });
    }

    default:
      return null;
  }
}
