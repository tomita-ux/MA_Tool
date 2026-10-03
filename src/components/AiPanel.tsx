import { Send, Sparkles } from 'lucide-react';
import { Fragment, useEffect, useState, type ReactNode } from 'react';
import { Button, Card, CardHeader, cx, inputClass } from '@/components/ui';
import { buildAiContext } from '@/core/analytics/aiContext';
import { REMOTE, useCanEdit } from '@/remote/session';
import { aiApi } from '@/remote/sync';
import { useApp } from '@/store/app';
import { useAnalysis } from '@/store/hooks';

// 「AI による解説」と質問応答 — Claude reads the same aggregates the screens show (server-side key).

const NO_IMPORTS = {};

export function AiPanel() {
  const { ds, an } = useAnalysis();
  const imports = useApp((s) => s.imports[ds.ws.id] ?? NO_IMPORTS);
  const canEdit = useCanEdit();
  const [report, setReport] = useState<{ text: string | null; createdAt?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [question, setQuestion] = useState('');
  const [answers, setAnswers] = useState<{ q: string; a: string }[]>([]);
  const [asking, setAsking] = useState(false);
  const wsId = ds.ws.id;

  useEffect(() => {
    setReport(null);
    setAnswers([]);
    setError(null);
    if (!REMOTE) return;
    aiApi.latest(wsId).then(setReport, (e: Error) => setError(e.message));
  }, [wsId]);

  if (!REMOTE) {
    return (
      <Card className="p-5">
        <p className="flex items-center gap-2 text-[14px] font-semibold">
          <Sparkles size={16} className="text-accent" /> AI による解説
        </p>
        <p className="mt-1 text-xs text-ink-2">公開版（https://ma-compass.pages.dev）で使えます。分析結果を Claude が文章で解説し、質問にも答えます。</p>
      </Card>
    );
  }

  const context = () => buildAiContext(ds, an, imports);

  const explain = async () => {
    setBusy(true);
    setError(null);
    try {
      setReport(await aiApi.explain(wsId, context()));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const ask = async () => {
    const q = question.trim();
    if (!q) return;
    setAsking(true);
    setError(null);
    try {
      const r = await aiApi.ask(wsId, context(), q);
      setAnswers((a) => [{ q, a: r.text }, ...a]);
      setQuestion('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAsking(false);
    }
  };

  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <Sparkles size={16} className="text-accent" /> AI による解説
          </span>
        }
        subtitle={
          report?.createdAt
            ? `${new Date(`${report.createdAt.replace(' ', 'T')}Z`).toLocaleString('ja-JP')} に作成 · 下のインサイトと集計値をもとに Claude が作成`
            : '下のインサイトと集計値をもとに、Claude が結論と次の打ち手を文章でまとめます。'
        }
        actions={
          canEdit && (
            <Button size="sm" variant={report?.text ? 'secondary' : 'primary'} disabled={busy} onClick={explain}>
              {busy ? '作成中…（30 秒ほど）' : report?.text ? '作り直す' : '解説を作成'}
            </Button>
          )
        }
      />
      <div className="flex flex-col gap-4 px-5 pb-5">
        {report?.text ? (
          <Markdown text={report.text} />
        ) : (
          report && <p className="text-xs text-muted">{canEdit ? 'まだ解説がありません。「解説を作成」を押してください。' : 'まだ解説がありません。管理者が作成すると表示されます。'}</p>
        )}
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void ask();
          }}
        >
          <input
            aria-label="AI に質問"
            className={cx(inputClass, 'flex-1')}
            placeholder="例：CPA が上がっている原因は？ 来月の予算はどこに寄せるべき？"
            value={question}
            maxLength={500}
            onChange={(e) => setQuestion(e.target.value)}
          />
          <Button type="submit" variant="primary" disabled={asking || !question.trim()}>
            <Send size={13} /> {asking ? '回答中…' : '質問'}
          </Button>
        </form>
        {error && <p className="text-xs text-critical-ink">{error}</p>}
        {answers.map((x, i) => (
          <div key={i} className="rounded-lg bg-surface-2 p-3">
            <p className="text-xs font-medium text-ink-2">Q. {x.q}</p>
            <div className="mt-1.5">
              <Markdown text={x.a} />
            </div>
          </div>
        ))}
        <p className="text-[11px] text-muted">AI の回答は集計値からの推論です。重要な判断の前に、元の数値をご確認ください。</p>
      </div>
    </Card>
  );
}

/** Minimal, safe Markdown: ## headings, - bullets, **bold**. Never injects HTML. */
function Markdown({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (!list.length) return;
    blocks.push(
      <ul key={blocks.length} className="list-disc space-y-0.5 pl-5">
        {list.map((l, i) => (
          <li key={i}>{inline(l)}</li>
        ))}
      </ul>,
    );
    list = [];
  };
  for (const raw of text.split('\n')) {
    const line = raw.trimEnd();
    const bullet = line.match(/^\s*(?:[-*・]|\d+\.)\s+(.*)$/);
    if (bullet) {
      list.push(bullet[1]);
      continue;
    }
    flush();
    if (!line.trim()) continue;
    const h = line.match(/^#{1,4}\s+(.*)$/);
    blocks.push(
      h ? (
        <p key={blocks.length} className="mt-1 text-[13px] font-semibold text-ink">{inline(h[1])}</p>
      ) : (
        <p key={blocks.length}>{inline(line)}</p>
      ),
    );
  }
  flush();
  return <div className="flex flex-col gap-1.5 text-[13px] leading-relaxed text-ink">{blocks}</div>;
}

function inline(s: string) {
  return s.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> : <Fragment key={i}>{part}</Fragment>,
  );
}
