import { ArrowRight, Check, Plus, Puzzle } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge, Button, Card, Field, Modal, ModuleDot, PageHeader, StageChip, cx, inputClass } from '@/components/ui';
import { CATEGORIES, STAGES } from '@/core/constants';
import { sampleProfileOf } from '@/core/data/generate';
import type { ConnectionType, ModuleCategory, ModuleManifest, StageId } from '@/core/types';
import { uid } from '@/lib/format';
import { catalog, moduleColors } from '@/modules';
import { useApp, useWorkspace } from '@/store/app';
import { useToast } from '@/store/toast';
import { CONNECTION_LABEL, ORIGIN_LABEL } from './ModulePage';

const CONNECTION_HELP: Record<ConnectionType, string> = {
  oauth: '各ツールのアカウントでログインして、読み取り専用で自動取得します。',
  apiKey: 'ツールが発行する API キーで自動取得します。',
  bridge: '既存ダッシュボードや管理画面から出力した JSON / CSV を取り込みます。',
  embed: '既存ダッシュボードの URL を登録し、そのまま表示します（改修不要）。',
  sample: 'サンプルデータで画面と分析を先に確認します。',
};

export function Catalog() {
  const ws = useWorkspace();
  const [adding, setAdding] = useState<ModuleManifest | null>(null);
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();
  const all = catalog(ws);
  const colors = moduleColors(ws);
  const enabled = new Set(ws.enabledModules);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={`${ws.name} · 有効 ${ws.enabledModules.length} / ${all.filter((m) => m.availability !== 'planned').length}`}
        title="モジュールカタログ"
        description="使うツールは企業ごとに違います。必要なチャネルを追加すると、ナビゲーション・全体 KPI・ジャーニー・予算シミュレーターに自動で組み込まれます。"
        actions={
          <Button variant="primary" onClick={() => setCreating(true)}>
            <Plus size={15} /> カスタムモジュールを作成
          </Button>
        }
      />

      {CATEGORIES.map((cat) => {
        const mods = all.filter((m) => m.category === cat.id);
        if (!mods.length) return null;
        return (
          <section key={cat.id} className="flex flex-col gap-3">
            <h2 className="eyebrow">{cat.name}</h2>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {mods.map((m) => {
                const on = enabled.has(m.id);
                const planned = m.availability === 'planned';
                return (
                  <motion.article key={m.id} layout className={cx('flex flex-col gap-3 rounded-xl border bg-surface p-4', on ? 'border-accent' : 'border-line')}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="flex items-center gap-2 text-[14px] font-semibold">
                          {on && <ModuleDot slot={colors[m.id]} />}
                          {m.name}
                        </h3>
                        {m.vendor && <p className="text-[11px] text-muted">{m.vendor}</p>}
                      </div>
                      <div className="flex flex-wrap justify-end gap-1">
                        <Badge tone={m.origin === 'existing' ? 'accent' : 'outline'}>{ORIGIN_LABEL[m.origin]}</Badge>
                        {planned && <Badge tone="neutral">近日対応</Badge>}
                      </div>
                    </div>
                    <p className="text-[13px] text-ink-2">{m.description}</p>
                    <div className="flex flex-wrap gap-1">
                      {m.stages.map((s) => (
                        <StageChip key={s} stage={s} compact />
                      ))}
                    </div>
                    <div className="mt-auto flex items-center justify-between gap-2 pt-1">
                      <span className="text-[11px] text-muted">{m.connection.map((c) => CONNECTION_LABEL[c]).join(' / ')}</span>
                      {on ? (
                        <Button size="sm" onClick={() => navigate(`/m/${m.id}`)}>
                          <Check size={13} /> 追加済み・開く
                        </Button>
                      ) : (
                        <Button size="sm" variant="primary" disabled={planned} onClick={() => setAdding(m)}>
                          <Plus size={13} /> 追加
                        </Button>
                      )}
                    </div>
                  </motion.article>
                );
              })}
            </div>
          </section>
        );
      })}

      <Card className="flex flex-col items-start gap-3 p-5 sm:flex-row sm:items-center">
        <Puzzle size={22} className="shrink-0 text-accent" />
        <div className="flex-1 text-[13px] text-ink-2">
          <p className="font-medium text-ink">ここにないツールを使っている場合</p>
          カスタムモジュールなら、コードを書かずに名称・担当段階・埋め込み URL・データ（JSON/CSV）を設定して追加できます。開発者向けの標準モジュール追加手順は docs/04-module-guide.md にあります。
        </div>
        <Button onClick={() => setCreating(true)}>作成する</Button>
      </Card>

      <ConnectWizard module={adding} onClose={() => setAdding(null)} />
      <CustomModuleForm open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}

function ConnectWizard({ module, onClose }: { module: ModuleManifest | null; onClose: () => void }) {
  return (
    <Modal open={!!module} onClose={onClose} title={module ? `${module.name}を追加` : ''} wide>
      {module && <WizardBody key={module.id} module={module} onClose={onClose} />}
    </Modal>
  );
}

function WizardBody({ module, onClose }: { module: ModuleManifest; onClose: () => void }) {
  const methods = [...new Set<ConnectionType>([...module.connection, 'sample'])];
  const [step, setStep] = useState(0);
  const [method, setMethod] = useState<ConnectionType>('sample');
  const [account, setAccount] = useState('');
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const enableModule = useApp((s) => s.enableModule);
  const setLegacyUrl = useApp((s) => s.setLegacyUrl);
  const notify = useToast((s) => s.notify);
  const navigate = useNavigate();
  const profile = sampleProfileOf(module);
  const accounts = [`${module.name}（本番アカウント）`, `${module.name}（テスト用）`];

  const next = () => {
    if (step === 1 && method === 'embed') {
      try {
        if (new URL(url).protocol !== 'https:') throw new Error();
      } catch {
        return setError('https:// で始まる URL を入力してください。');
      }
    }
    if (step === 1 && method === 'oauth' && !account) return setError('アカウントを選んでください。');
    setError('');
    setStep((s) => s + 1);
  };

  const finish = () => {
    enableModule(module.id, { status: 'sample', method, account: account || undefined, connectedAt: new Date().toISOString() });
    if (method === 'embed' && url) setLegacyUrl(module.id, url);
    notify(`${module.shortName ?? module.name}を追加しました`);
    onClose();
    navigate(`/m/${module.id}`);
  };

  const steps = ['接続方式', 'アカウント', '段階の確認'];

  return (
    <div className="flex flex-col gap-5">
      <ol className="flex items-center gap-2 text-xs">
        {steps.map((s, i) => (
          <li key={s} className="flex items-center gap-2">
            <span className={cx('flex size-6 items-center justify-center rounded-full font-mono text-[11px]', i < step ? 'bg-accent text-accent-ink' : i === step ? 'border-2 border-accent text-accent' : 'border border-line-strong text-muted')}>
              {i < step ? <Check size={12} /> : i + 1}
            </span>
            <span className={i === step ? 'font-medium text-ink' : 'text-muted'}>{s}</span>
            {i < steps.length - 1 && <span className="h-px w-6 bg-line-strong" />}
          </li>
        ))}
      </ol>

      <AnimatePresence mode="wait">
        <motion.div key={step} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.18 }}>
          {step === 0 && (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-[13px] text-ink-2">データの取り込み方を選んでください。</legend>
              {methods.map((m) => (
                <label key={m} className={cx('flex cursor-pointer gap-3 rounded-xl border p-3', method === m ? 'border-accent bg-accent-soft' : 'border-line hover:border-line-strong')}>
                  <input type="radio" name="method" value={m} checked={method === m} onChange={() => setMethod(m)} className="mt-1 accent-[var(--accent)]" />
                  <span>
                    <span className="block text-[13px] font-medium">
                      {CONNECTION_LABEL[m]}
                      {(m === 'oauth' || m === 'apiKey') && <Badge tone="outline" className="ml-2">Phase 2 で自動取得</Badge>}
                    </span>
                    <span className="block text-xs text-ink-2">{CONNECTION_HELP[m]}</span>
                  </span>
                </label>
              ))}
            </fieldset>
          )}
          {step === 1 && (
            <div className="flex flex-col gap-3">
              {method === 'oauth' && (
                <Field label="取得するアカウント" htmlFor="wiz-account" hint="MVP では模擬接続です。画面と分析はサンプルデータで表示されます。">
                  <select id="wiz-account" className={inputClass} value={account} onChange={(e) => setAccount(e.target.value)}>
                    <option value="">選んでください</option>
                    {accounts.map((a) => <option key={a}>{a}</option>)}
                  </select>
                </Field>
              )}
              {method === 'apiKey' && (
                <Field label="API キー" htmlFor="wiz-key" hint="MVP ではキーを保存しません。Phase 2 ではサーバー側で暗号化して保管します。">
                  <input id="wiz-key" type="password" autoComplete="off" className={inputClass} placeholder="••••••••" />
                </Field>
              )}
              {method === 'embed' && (
                <Field label="既存ダッシュボードの URL" htmlFor="wiz-url">
                  <input id="wiz-url" className={inputClass} placeholder="https://" value={url} onChange={(e) => setUrl(e.target.value)} />
                </Field>
              )}
              {method === 'bridge' && <p className="text-[13px] text-ink-2">追加後、モジュールの「データ連携」タブから JSON / CSV を取り込めます。取り込むまではサンプルデータで表示します。</p>}
              {method === 'sample' && <p className="text-[13px] text-ink-2">サンプルデータで追加します。あとから「データ連携」タブで実データに切り替えられます。</p>}
              {error && <p className="text-xs text-critical-ink">{error}</p>}
            </div>
          )}
          {step === 2 && (
            <div className="flex flex-col gap-3">
              <p className="text-[13px] text-ink-2">
                このモジュールのキャンペーンは、次のジャーニー段階に対応付けられます。追加すると、ジャーニー・アトリビューション・セグメント分析{module.paid ? '・予算シミュレーター' : ''}に自動で組み込まれます。
              </p>
              <ul className="rounded-xl border border-line">
                {profile.campaigns.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3 border-b border-line px-3 py-2 text-[13px] last:border-0">
                    <span>{c.name}</span>
                    <StageChip stage={c.stage} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      <div className="flex justify-between gap-2 border-t border-line pt-4">
        <Button variant="ghost" onClick={() => (step === 0 ? onClose() : setStep(step - 1))}>
          {step === 0 ? 'キャンセル' : '戻る'}
        </Button>
        {step < 2 ? (
          <Button variant="primary" onClick={next}>
            次へ <ArrowRight size={14} />
          </Button>
        ) : (
          <Button variant="primary" onClick={finish}>
            <Check size={14} /> 追加する
          </Button>
        )}
      </div>
    </div>
  );
}

function CustomModuleForm({ open, onClose }: { open: boolean; onClose: () => void }) {
  const addCustomModule = useApp((s) => s.addCustomModule);
  const setLegacyUrl = useApp((s) => s.setLegacyUrl);
  const notify = useToast((s) => s.notify);
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<ModuleCategory>('custom');
  const [stages, setStages] = useState<StageId[]>(['interest']);
  const [paid, setPaid] = useState(false);
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');

  const reset = () => {
    setName('');
    setDescription('');
    setCategory('custom');
    setStages(['interest']);
    setPaid(false);
    setUrl('');
    setError('');
  };

  const create = () => {
    if (!name.trim()) return setError('名称を入力してください。');
    if (!stages.length) return setError('担当段階を 1 つ以上選んでください。');
    if (url) {
      try {
        if (new URL(url).protocol !== 'https:') throw new Error();
      } catch {
        return setError('URL は https:// で始まる形式で入力してください。');
      }
    }
    const id = uid('custom');
    const m: ModuleManifest = {
      id,
      name: name.trim(),
      description: description.trim() || 'カスタムモジュール',
      category,
      origin: 'custom',
      role: 'channel',
      connection: ['bridge', 'embed', 'sample'],
      stages: STAGES.filter((s) => stages.includes(s.id)).map((s) => s.id),
      paid,
      kpis: paid ? ['cost', 'clicks', 'conversions', 'cpa'] : ['impressions', 'clicks', 'conversions', 'cvr'],
      widgets: [],
      colorSlot: 0,
    };
    addCustomModule(m, { status: 'sample', method: 'sample', connectedAt: new Date().toISOString() });
    if (url) setLegacyUrl(id, url);
    notify(`${m.name}を作成しました`);
    reset();
    onClose();
    navigate(`/m/${id}`);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="カスタムモジュールを作成"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>キャンセル</Button>
          <Button variant="primary" onClick={create}>作成して追加</Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="名称（必須）" htmlFor="cm-name">
          <input id="cm-name" className={inputClass} placeholder="例：note、ウェビナー、展示会" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="説明" htmlFor="cm-desc">
          <input id="cm-desc" className={inputClass} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <Field label="カテゴリ" htmlFor="cm-cat">
          <select id="cm-cat" className={inputClass} value={category} onChange={(e) => setCategory(e.target.value as ModuleCategory)}>
            {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="担当するジャーニー段階">
          <div className="flex flex-wrap gap-1.5">
            {STAGES.map((s) => {
              const on = stages.includes(s.id);
              return (
                <button key={s.id} type="button" aria-pressed={on} onClick={() => setStages(on ? stages.filter((x) => x !== s.id) : [...stages, s.id])} className={cx('rounded-full border px-2.5 py-1 text-xs', on ? 'border-accent bg-accent-soft text-ink' : 'border-line-strong text-ink-2')}>
                  {s.name}
                </button>
              );
            })}
          </div>
        </Field>
        <label className="flex items-center gap-2 text-[13px]">
          <input type="checkbox" checked={paid} onChange={(e) => setPaid(e.target.checked)} className="accent-[var(--accent)]" />
          費用が発生するチャネル（予算シミュレーターの対象にする）
        </label>
        <Field label="既存ダッシュボードの URL（任意）" htmlFor="cm-url">
          <input id="cm-url" className={inputClass} placeholder="https://" value={url} onChange={(e) => setUrl(e.target.value)} />
        </Field>
        {error && <p className="text-xs text-critical-ink">{error}</p>}
      </div>
    </Modal>
  );
}
