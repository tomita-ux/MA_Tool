import Anthropic from '@anthropic-ai/sdk';

// Claude API for 「AI による解説」と質問応答. The key stays on the server (Pages secret ANTHROPIC_API_KEY).

export interface AiClient {
  complete(system: string, user: string): Promise<string>;
}

export class AiError extends Error {}

export const AI_MODEL = 'claude-opus-5-5';

export function createAi(apiKey: string | undefined): AiClient | null {
  if (!apiKey) return null;
  const client = new Anthropic({ apiKey });
  return {
    async complete(system, user) {
      let response;
      try {
        response = await client.beta.messages.create({
          model: AI_MODEL,
          max_tokens: 16000,
          output_config: { effort: 'medium' },
          // on a policy decline, the API re-runs the request on a fallback model inside the same call
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
          system,
          messages: [{ role: 'user', content: user }],
        });
      } catch (e) {
        if (e instanceof Anthropic.RateLimitError) throw new AiError('AI の利用が混み合っています。少し待ってからもう一度お試しください。');
        if (e instanceof Anthropic.AuthenticationError) throw new AiError('AI の API キーが正しくありません（管理者に連絡してください）。');
        if (e instanceof Anthropic.APIError) throw new AiError(`AI の呼び出しに失敗しました（${e.status ?? '接続エラー'}）。`);
        throw e;
      }
      if (response.stop_reason === 'refusal') throw new AiError('この内容には AI が回答できませんでした。');
      const text = response.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('\n').trim();
      if (!text) throw new AiError('AI から回答が得られませんでした。');
      return text;
    },
  };
}

export const EXPLAIN_SYSTEM = `あなたはマーケティング支援会社のシニアアナリストです。支援先企業のマーケティング実績データ（MA Compass の集計結果）を読み、担当者と経営者が次の打ち手を決められるよう日本語で解説します。

書き方:
- 最初に結論を 2〜3 文で書く（KGI の達成見込みと、いちばん効く打ち手）。
- 続けて「うまくいっていること」「課題」「次の 2 週間でやること（優先順に 3 つまで）」を見出し付きで書く。
- 数字は与えられたデータからのみ引用し、根拠の数字を必ず添える。データにない数字や事実を作らない。推定値（サンプル・モデル推定）は推定と明記する。
- 専門用語は短く言い換える。全体で 600 字程度。Markdown の見出し（##）と箇条書きを使う。`;

export const ASK_SYSTEM = `あなたはマーケティング支援会社のアナリストです。与えられた支援先企業のマーケティング実績データ（MA Compass の集計結果）だけを根拠に、質問に日本語で簡潔に答えます。
- データから言えないことは「このデータからは分かりません」と答え、確かめるのに必要なデータを 1 行で示す。
- 数字を使うときはデータの値をそのまま引用する。推定値は推定と明記する。
- 300 字以内。必要なら箇条書き。`;
