import React, { useEffect, useState } from 'react';
import { DeliverableFile } from '../types';
import { Copy, Check, Download, FileCode, Smartphone } from 'lucide-react';

export const DeliverablesCodeView: React.FC = () => {
  const [files, setFiles] = useState<DeliverableFile[]>([]);
  const [selectedId, setSelectedId] = useState<string>('index.html');
  const [copied, setCopied] = useState<boolean>(false);

  useEffect(() => {
    fetch('/api/deliverables')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data.deliverables)) {
          setFiles(data.deliverables);
        }
      })
      .catch(() => {});
  }, []);

  const activeFile = files.find((f) => f.id === selectedId) || files[0];

  const handleCopy = () => {
    if (!activeFile) return;
    navigator.clipboard.writeText(activeFile.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const handleDownload = () => {
    if (!activeFile) return;
    const blob = new Blob([activeFile.content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = activeFile.id;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="neon-card-active rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Smartphone className="w-5 h-5 text-cyan-400" />
            <h2 className="text-lg font-bold text-slate-100">
              HopWeb + GitHub + Render All-in-One Single-File (`index.html`) &amp; Server Code
            </h2>
          </div>
          <p className="text-xs text-slate-300 mt-1">
            মোবাইলে HopWeb দিয়ে এডিট এবং GitHub ও Render-এ কোনো ভাগ ছাড়াই রান করার জন্য <strong>index.html</strong> ফাইলের ভেতরেই HTML + CSS + JS + JSON Config + <code>worker.js</code> + Telegram <code>/start</code> MiniApp কোড একত্রে দেওয়া হয়েছে!
          </p>
        </div>
        {activeFile && (
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleCopy}
              className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-cyan-300 border border-cyan-500/40 flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied!' : `Copy ${activeFile.id}`}</span>
            </button>
            <button
              type="button"
              onClick={handleDownload}
              className="neon-btn-cyan px-3.5 py-2 rounded-lg text-xs font-semibold text-white flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download {activeFile.id}</span>
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left File Selector */}
        <div className="lg:col-span-4 neon-card rounded-xl p-4 flex flex-col gap-2">
          <div className="text-xs font-semibold text-cyan-300 px-2 pb-1 border-b border-slate-800">
            Select File to Copy / Edit in HopWeb
          </div>
          {files.map((file) => {
            const isSelected = file.id === (activeFile?.id || '');
            return (
              <button
                key={file.id}
                type="button"
                onClick={() => setSelectedId(file.id)}
                className={`text-left px-3.5 py-3 rounded-lg text-xs transition-all flex items-start gap-2.5 cursor-pointer border ${
                  isSelected
                    ? 'bg-cyan-500/20 border-cyan-400/60 text-cyan-200 shadow-[0_0_15px_-4px_rgba(34,211,238,0.4)]'
                    : 'bg-slate-950/60 border-slate-800/80 text-slate-300 hover:bg-slate-900'
                }`}
              >
                <FileCode className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <div className="font-mono font-bold text-slate-100 truncate">{file.id}</div>
                  <div className="text-slate-400 mt-0.5 line-clamp-2">{file.title}</div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Right Code Viewer */}
        <div className="lg:col-span-8 neon-card rounded-xl p-5 flex flex-col gap-3">
          {activeFile ? (
            <>
              <div className="flex items-center justify-between border-b border-cyan-500/15 pb-3">
                <span className="text-sm font-bold text-slate-100">{activeFile.title}</span>
                <span className="text-xs font-mono text-cyan-400 uppercase">
                  {activeFile.language}
                </span>
              </div>
              <pre className="bg-[#03060e] border border-slate-800/90 rounded-xl p-4 text-xs font-mono text-slate-200 overflow-x-auto max-h-[620px] leading-relaxed">
                {activeFile.content}
              </pre>
            </>
          ) : (
            <div className="p-8 text-center text-xs text-slate-400 font-mono">
              Loading production deliverables...
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
