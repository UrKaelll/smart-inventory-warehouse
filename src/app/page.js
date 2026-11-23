'use client';

import Warehouse3D from '../components/warehouse/Warehouse3D';
import React, { useState, useEffect, useRef } from 'react';
import Papa from 'papaparse';
import {
  ArrowUpRight,
  ArrowDownLeft,
  Check,
  Send,
  AlertTriangle,
  Play,
  Pause,
  Upload,
  SlidersHorizontal
} from 'lucide-react';

export default function SmartInventoryDashboard() {
  const [inventory, setInventory] = useState([]);
  const [activeFileName, setActiveFileName] = useState('stok_barang.csv');

  const [selectedSku, setSelectedSku] = useState('SKU-001');
  const [isAutoSimulating, setIsAutoSimulating] = useState(false);
  const [activePackages, setActivePackages] = useState([]);
  const [scannerFlash, setScannerFlash] = useState(null);
  const [conveyorLogs, setConveyorLogs] = useState([]);
  const [cameraAngle, setCameraAngle] = useState('ISOMETRIC');

  // Menyimpan waktu peluncuran box terakhir per jalur agar selalu ada jarak antar-box
  const nextSlotRef = useRef({ IN: 0, OUT: 0 });

  const [promptInput, setPromptInput] = useState(
    'Periksa stok gudang dari file stok_barang.csv dan siapkan draft pengajuan restock untuk barang yang di bawah batas aman.'
  );
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [agentResponse, setAgentResponse] = useState(null);
  const [poApprovalStatus, setPoApprovalStatus] = useState(null);

  useEffect(() => {
    loadCsvFromPublic('/stok_barang.csv', 'stok_barang.csv');
  }, []);

  const loadCsvFromPublic = async (url, fileName) => {
    try {
      const response = await fetch(url);
      const csvText = await response.text();
      Papa.parse(csvText, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          setInventory(results.data);
          setActiveFileName(fileName);
          setAgentResponse(null);
          setPoApprovalStatus(null);
          if (results.data.length > 0 && results.data[0].SKU) {
            setSelectedSku(results.data[0].SKU);
          }
        },
      });
    } catch (err) {
      console.error('Gagal memuat CSV:', err);
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        setInventory(results.data);
        setActiveFileName(file.name);
        setAgentResponse(null);
        setPoApprovalStatus(null);
      },
    });
  };

  const triggerConveyor = (direction, targetSku = selectedSku) => {
    const itemIndex = inventory.findIndex((item) => item.SKU === targetSku);
    if (itemIndex === -1) return;

    const targetItem = inventory[itemIndex];
    const currentStock = Number(targetItem.Stok_Saat_Ini);

    if (direction === 'OUT' && currentStock <= 0) {
      addLog(`Stok ${targetSku} kosong (0), pengiriman dibatalkan.`);
      return;
    }

    // Perbarui stok langsung
    const updatedInventory = [...inventory];
    const newStock = direction === 'IN' ? currentStock + 1 : currentStock - 1;
    updatedInventory[itemIndex] = {
      ...targetItem,
      Stok_Saat_Ini: newStock,
    };
    setInventory(updatedInventory);

    const timeStr = new Date().toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    if (direction === 'IN') {
      addLog(`${timeStr} · Masuk +1 ${targetItem.Nama_Barang} (${targetSku}) → Sisa ${newStock}`);
    } else {
      addLog(`${timeStr} · Keluar -1 ${targetItem.Nama_Barang} (${targetSku}) → Sisa ${newStock}`);
    }

    // Hitung jeda otomatis (minimal 850ms antar-box) supaya box tidak saling menempel saat diklik cepat
    const now = Date.now();
    const SPACING_MS = 850;
    const launchTime = Math.max(now, nextSlotRef.current[direction]);
    nextSlotRef.current[direction] = launchTime + SPACING_MS;
    const launchDelay = launchTime - now;

    setTimeout(() => {
      const pkgId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const newPkg = {
        id: pkgId,
        direction,
        sku: targetSku,
        nama: targetItem.Nama_Barang,
        createdAt: Date.now(),
      };

      setActivePackages((prev) => [...prev, newPkg]);

      const scanDelay = direction === 'IN' ? 950 : 2350;
      setTimeout(() => setScannerFlash(direction), scanDelay);
      setTimeout(() => setScannerFlash(null), scanDelay + 550);

      // Hapus box setelah selesai mencapai ujung lintasan penuh (3600ms)
      setTimeout(() => {
        setActivePackages((prev) => prev.filter((p) => p.id !== pkgId));
      }, 3650);
    }, launchDelay);
  };

  const addLog = (msg) => {
    setConveyorLogs((prev) => [msg, ...prev].slice(0, 4));
  };

  useEffect(() => {
    if (!isAutoSimulating || inventory.length === 0) return;
    const interval = setInterval(() => {
      const randomItem = inventory[Math.floor(Math.random() * inventory.length)];
      if (!randomItem || !randomItem.SKU) return;
      const dir = Math.random() > 0.35 ? 'OUT' : 'IN';
      triggerConveyor(dir, randomItem.SKU);
    }, 2200);
    return () => clearInterval(interval);
  }, [isAutoSimulating, inventory]);

  const runAiAgent = async (e, customPrompt) => {
    if (e) e.preventDefault();
    const finalPrompt = customPrompt || promptInput;
    if (customPrompt) setPromptInput(customPrompt);

    setIsAnalyzing(true);
    setPoApprovalStatus(null);

    try {
      const res = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inventoryData: inventory,
          sourceName: activeFileName,
          userPrompt: finalPrompt,
        }),
      });
      const data = await res.json();
      setAgentResponse(data);
    } catch (error) {
      setAgentResponse({
        status: 'FAILURE',
        message: 'Tidak dapat terhubung ke layanan analisis.',
        errors: [error.message],
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleApprovePO = () => {
    setPoApprovalStatus('APPROVED');
    addLog(`Purchase Order resmi disetujui dan diteruskan ke supplier.`);
  };

  const handleRejectPO = () => {
    setPoApprovalStatus('REJECTED');
    addLog(`Pengajuan Purchase Order dibatalkan.`);
  };

  const quickPrompts = [
    'Cek stok kritis & siapkan draft PO',
    'Berapa total nilai aset gudang saat ini?',
    'Barang apa yang paling mahal per unit?',
  ];

  return (
    <div className="min-h-screen bg-[#F6F5F2] text-[#1F2124] antialiased selection:bg-[#2E5A44]/15">
      {/* TOP NAVIGATION BAR */}
      <nav className="border-b border-[#E5E3DC] bg-[#FAF9F6]/90 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-5 md:px-8 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-[#2E5A44] text-[#F6F5F2] flex items-center justify-center font-bold text-sm tracking-tight">
              WH
            </div>
            <div>
              <h1 className="text-base md:text-lg font-semibold tracking-tight text-[#18191B]">
                Smart Inventory Monitoring & Auto-Reorder Agent
              </h1>
              <p className="text-xs text-[#6E7178]">
                Dataset aktif: <span className="font-mono text-[#2E5A44] font-medium">{activeFileName}</span>
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => loadCsvFromPublic('/stok_barang.csv', 'stok_barang.csv')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
                activeFileName === 'stok_barang.csv'
                  ? 'bg-[#2E5A44] text-white'
                  : 'bg-white border border-[#DCDAD2] text-[#4A4D52] hover:bg-[#EFECE6]'
              }`}
            >
              Data Normal
            </button>

            <button
              onClick={() => loadCsvFromPublic('/stok_error.csv', 'stok_error.csv')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
                activeFileName === 'stok_error.csv'
                  ? 'bg-[#B85D43] text-white'
                  : 'bg-white border border-[#DCDAD2] text-[#4A4D52] hover:bg-[#EFECE6]'
              }`}
            >
              Uji Data Error
            </button>

            <label className="px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 bg-white hover:bg-[#EFECE6] text-[#323438] cursor-pointer border border-[#DCDAD2] transition">
              <Upload className="w-3.5 h-3.5 text-[#6E7178]" />
              Unggah CSV
              <input type="file" accept=".csv" onChange={handleFileUpload} className="hidden" />
            </label>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-5 md:px-8 py-7 space-y-8">
        {/* BAGIAN 1: VISUALISASI LANTAI GUDANG 3D & KONTROL PERGERAKAN */}
        <section className="bg-white border border-[#E5E3DC] rounded-2xl overflow-hidden shadow-[0_2px_12px_rgba(0,0,0,0.03)]">
          {/* Toolbar Kontrol Simulasi */}
          <div className="px-5 py-4 border-b border-[#ECEAE4] flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-[#FCFBF9]">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="text-xs font-medium text-[#6E7178] flex items-center gap-1.5">
                <SlidersHorizontal className="w-3.5 h-3.5" /> Barang Terpilih:
              </span>
              <select
                value={selectedSku}
                onChange={(e) => setSelectedSku(e.target.value)}
                className="bg-white border border-[#DCDAD2] text-xs md:text-sm rounded-lg px-3 py-1.5 text-[#1F2124] font-medium focus:outline-none focus:border-[#2E5A44]"
              >
                {inventory.map((item, idx) => (
                  <option key={idx} value={item.SKU}>
                    {item.SKU} · {item.Nama_Barang} ({item.Stok_Saat_Ini} unit)
                  </option>
                ))}
              </select>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => triggerConveyor('IN')}
                  className="bg-[#2E5A44] hover:bg-[#244736] text-white text-xs font-medium px-3.5 py-1.5 rounded-lg flex items-center gap-1 transition cursor-pointer"
                >
                  <ArrowDownLeft className="w-3.5 h-3.5" /> Terima (+1)
                </button>
                <button
                  onClick={() => triggerConveyor('OUT')}
                  className="bg-white hover:bg-[#F7EFECE6] text-[#B85D43] border border-[#E2C7BF] text-xs font-medium px-3.5 py-1.5 rounded-lg flex items-center gap-1 transition cursor-pointer"
                >
                  <ArrowUpRight className="w-3.5 h-3.5" /> Keluarkan (-1)
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <div className="inline-flex rounded-lg bg-[#F1EFEA] p-0.5 border border-[#E5E3DC] text-xs">
                {[
                  { id: 'ISOMETRIC', label: 'Isometrik' },
                  { id: 'FRONT', label: 'Depan' },
                  { id: 'TOP', label: 'Denah Atas' },
                ].map((view) => (
                  <button
                    key={view.id}
                    onClick={() => setCameraAngle(view.id)}
                    className={`px-2.5 py-1 rounded-md font-medium transition cursor-pointer ${
                      cameraAngle === view.id
                        ? 'bg-white text-[#18191B] shadow-xs'
                        : 'text-[#6E7178] hover:text-[#18191B]'
                    }`}
                  >
                    {view.label}
                  </button>
                ))}
              </div>

              <button
                onClick={() => setIsAutoSimulating(!isAutoSimulating)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 border transition cursor-pointer ${
                  isAutoSimulating
                    ? 'bg-[#FDF6EC] text-[#9A6726] border-[#EAD5B7]'
                    : 'bg-white text-[#323438] border-[#DCDAD2] hover:bg-[#F6F5F2]'
                }`}
              >
                {isAutoSimulating ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                {isAutoSimulating ? 'Hentikan Arus' : 'Simulasi Otomatis'}
              </button>
            </div>
          </div>

          {/* Kanvas 3D */}
          <Warehouse3D
            inventory={inventory}
            selectedSku={selectedSku}
            setSelectedSku={setSelectedSku}
            cameraAngle={cameraAngle}
            activePackages={activePackages}
            scannerFlash={scannerFlash}
          />

          {/* Strip Kartu Rak Fisik di Bawah Kanvas */}
          <div className="p-4 bg-[#FAF9F6] border-t border-[#ECEAE4]">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
              {inventory.map((item, idx) => {
                const stok = Number(item.Stok_Saat_Ini);
                const min = Number(item.Batas_Minimum);
                const isInvalid = isNaN(stok) || stok < 0;
                const isLow = !isInvalid && stok <= min;
                const isSelected = selectedSku === item.SKU;

                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => item.SKU && setSelectedSku(item.SKU)}
                    className={`text-left p-3 rounded-xl border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-white border-[#2E5A44] ring-2 ring-[#2E5A44]/15'
                        : 'bg-white/70 border-[#E5E3DC] hover:bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <span className="font-mono text-[11px] font-semibold text-[#5C6066]">{item.SKU}</span>
                      <span
                        className={`text-[11px] font-semibold px-1.5 py-0.5 rounded ${
                          isInvalid
                            ? 'bg-[#FBECE8] text-[#B85D43]'
                            : isLow
                            ? 'bg-[#FDF3E3] text-[#A86B1D]'
                            : 'bg-[#EBF3EE] text-[#2E5A44]'
                        }`}
                      >
                        {isInvalid ? 'Error' : `${stok} unit`}
                      </span>
                    </div>
                    <div className="text-xs font-medium text-[#1F2124] truncate">{item.Nama_Barang}</div>
                    <div className="text-[11px] text-[#888C94] mt-0.5">Batas aman: {item.Batas_Minimum}</div>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* BAGIAN 2: WORKSPACE OPERASIONAL (BUKU STOK & ASISTEN PENGADAAN) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-7 items-start">
          <section className="lg:col-span-7 bg-white border border-[#E5E3DC] rounded-2xl p-6 shadow-[0_2px_12px_rgba(0,0,0,0.03)]">
            <div className="flex items-baseline justify-between mb-5">
              <div>
                <h2 className="text-base font-semibold text-[#18191B]">Catatan Persediaan Barang</h2>
                <p className="text-xs text-[#6E7178] mt-0.5">
                  Klik baris barang untuk menyorot lokasi rak di denah 3D
                </p>
              </div>
              <span className="text-xs text-[#6E7178]">{inventory.length} item tercatat</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-[#E5E3DC] text-[#6E7178]">
                    <th className="py-2.5 pr-3 font-medium">Kode</th>
                    <th className="py-2.5 px-3 font-medium">Nama Barang</th>
                    <th className="py-2.5 px-3 text-right font-medium">Stok</th>
                    <th className="py-2.5 px-3 text-right font-medium">Min</th>
                    <th className="py-2.5 px-3 text-right font-medium">Harga Satuan</th>
                    <th className="py-2.5 pl-3 font-medium">Pemasok</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F0EFEA]">
                  {inventory.map((row, idx) => {
                    const stok = Number(row.Stok_Saat_Ini);
                    const min = Number(row.Batas_Minimum);
                    const isLow = !isNaN(stok) && !isNaN(min) && stok <= min && stok >= 0;
                    const isInvalid = isNaN(stok) || stok < 0 || !row.SKU?.startsWith('SKU-') || !row.Supplier;

                    return (
                      <tr
                        key={idx}
                        onClick={() => row.SKU && setSelectedSku(row.SKU)}
                        className={`cursor-pointer transition-colors ${
                          selectedSku === row.SKU ? 'bg-[#F3F6F4]' : 'hover:bg-[#FAF9F6]'
                        }`}
                      >
                        <td className="py-3 pr-3 font-mono font-medium text-[#4A4D52]">{row.SKU || '—'}</td>
                        <td className="py-3 px-3 font-medium text-[#18191B]">
                          <div className="flex items-center gap-2">
                            <span>{row.Nama_Barang || '—'}</span>
                            {isInvalid && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#FBECE8] text-[#B85D43]">
                                Anomali
                              </span>
                            )}
                            {!isInvalid && isLow && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#FDF3E3] text-[#A86B1D]">
                                Menipis
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-3 text-right font-semibold tabular-nums">
                          {row.Stok_Saat_Ini}
                        </td>
                        <td className="py-3 px-3 text-right text-[#6E7178] tabular-nums">
                          {row.Batas_Minimum}
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-[#4A4D52] tabular-nums">
                          {row.Harga ? `Rp${Number(row.Harga).toLocaleString('id-ID')}` : '—'}
                        </td>
                        <td className="py-3 pl-3 text-[#4A4D52]">
                          {row.Supplier || <span className="text-[#B85D43] italic">Tidak tercantum</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-6 pt-4 border-t border-[#ECEAE4]">
              <div className="text-[11px] font-medium text-[#6E7178] mb-2">Riwayat Pergerakan Terakhir</div>
              {conveyorLogs.length === 0 ? (
                <p className="text-xs text-[#94979E]">Belum ada pergerakan barang tercatat sesi ini.</p>
              ) : (
                <ul className="space-y-1.5 text-xs text-[#4A4D52] font-mono">
                  {conveyorLogs.map((log, i) => (
                    <li key={i} className="truncate">{log}</li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <section className="lg:col-span-5 bg-white border border-[#E5E3DC] rounded-2xl p-6 shadow-[0_2px_12px_rgba(0,0,0,0.03)]">
            <div className="mb-4">
              <h2 className="text-base font-semibold text-[#18191B]">Asisten Analisis & Pengadaan</h2>
              <p className="text-xs text-[#6E7178] mt-0.5">
                Tanyakan kondisi stok, valuasi barang, atau buat draf Purchase Order
              </p>
            </div>

            <div className="flex flex-wrap gap-1.5 mb-3">
              {quickPrompts.map((qp, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => runAiAgent(null, qp)}
                  className="text-[11px] px-2.5 py-1 rounded-full bg-[#F4F3EF] hover:bg-[#E9E7E0] text-[#4A4D52] transition cursor-pointer"
                >
                  {qp}
                </button>
              ))}
            </div>

            <form onSubmit={runAiAgent} className="mb-5">
              <textarea
                rows={3}
                value={promptInput}
                onChange={(e) => setPromptInput(e.target.value)}
                placeholder="Tulis pertanyaan atau instruksi pengadaan..."
                className="w-full bg-[#FAF9F6] border border-[#DCDAD2] rounded-xl p-3 text-xs md:text-sm text-[#1F2124] placeholder-[#94979E] focus:outline-none focus:border-[#2E5A44] focus:bg-white transition"
              />
              <button
                type="submit"
                disabled={isAnalyzing}
                className="mt-2.5 w-full bg-[#2E5A44] hover:bg-[#244736] disabled:bg-[#A3B0A8] text-white font-medium py-2.5 px-4 rounded-xl text-xs md:text-sm flex items-center justify-center gap-2 transition cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                {isAnalyzing ? 'Menganalisis data...' : 'Jalankan Analisis'}
              </button>
            </form>

            {!agentResponse && (
              <div className="rounded-xl bg-[#FAF9F6] border border-[#ECEAE4] p-4 text-xs text-[#6E7178] leading-relaxed">
                Sistem akan memeriksa validitas data terlebih dahulu sebelum menghitung kebutuhan restock atau menjawab pertanyaan Anda.
              </div>
            )}

            {agentResponse?.status === 'FAILURE' && (
              <div className="rounded-xl bg-[#FDF7F5] border border-[#ECCBC2] p-4 space-y-3">
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-[#B85D43] shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-semibold text-xs text-[#96422B]">
                      Validasi Data Gagal — Proses Ditahan
                    </h3>
                    <p className="text-xs text-[#7A3B2A] mt-1 leading-relaxed">{agentResponse.message}</p>
                  </div>
                </div>
                <ul className="space-y-1 text-[11px] text-[#8F3F29] font-mono bg-white/80 p-3 rounded-lg border border-[#F2DCD6]">
                  {agentResponse.errors?.map((err, i) => (
                    <li key={i}>• {err}</li>
                  ))}
                </ul>
              </div>
            )}

            {agentResponse?.status === 'AI_ANSWER' && (
              <div className="rounded-xl bg-[#F6F8F7] border border-[#DCE5DF] p-4 text-xs text-[#26292E] leading-relaxed whitespace-pre-line">
                {agentResponse.message}
              </div>
            )}

            {agentResponse?.status === 'CONTROL_APPROVAL_NEEDED' && (
              <div className="rounded-xl bg-[#FAF9F6] border border-[#E5E3DC] p-4 space-y-4">
                <div>
                  <span className="inline-block text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded bg-[#FDF3E3] text-[#A86B1D]">
                    Menunggu Persetujuan
                  </span>
                  <p className="text-xs text-[#2D3035] mt-2 leading-relaxed whitespace-pre-line">
                    {agentResponse.message}
                  </p>
                </div>

                <div className="bg-white border border-[#E5E3DC] rounded-lg overflow-hidden">
                  <div className="px-3 py-2 bg-[#F6F5F2] border-b border-[#E5E3DC] flex justify-between items-center text-[11px] font-semibold text-[#323438]">
                    <span>Draf Purchase Order</span>
                    <span className="font-normal text-[#6E7178]">Target: 2× Min</span>
                  </div>
                  <table className="w-full text-left text-xs">
                    <tbody className="divide-y divide-[#F0EFEA]">
                      {agentResponse.poDraft.map((item, idx) => (
                        <tr key={idx}>
                          <td className="p-2.5">
                            <div className="font-medium text-[#18191B]">{item.Nama_Barang}</div>
                            <div className="text-[11px] text-[#6E7178]">{item.Supplier}</div>
                          </td>
                          <td className="p-2.5 text-right font-semibold text-[#A86B1D]">
                            +{item.Jumlah_Pesan}
                          </td>
                          <td className="p-2.5 text-right font-mono text-[#323438]">
                            Rp{item.Total_Biaya.toLocaleString('id-ID')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-[#FAF9F6] border-t border-[#E5E3DC] font-semibold text-xs">
                      <tr>
                        <td colSpan={2} className="p-2.5 text-right text-[#6E7178]">
                          Total Pengajuan
                        </td>
                        <td className="p-2.5 text-right font-mono text-[#2E5A44]">
                          {agentResponse.formattedTotal}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {poApprovalStatus === null && (
                  <div className="flex gap-2">
                    <button
                      onClick={handleApprovePO}
                      className="flex-1 bg-[#2E5A44] hover:bg-[#244736] text-white text-xs font-medium py-2 px-3 rounded-lg transition cursor-pointer"
                    >
                      Setujui PO
                    </button>
                    <button
                      onClick={handleRejectPO}
                      className="px-4 py-2 bg-white hover:bg-[#FBECE8] text-[#6E7178] hover:text-[#B85D43] border border-[#DCDAD2] text-xs font-medium rounded-lg transition cursor-pointer"
                    >
                      Tolak
                    </button>
                  </div>
                )}

                {poApprovalStatus === 'APPROVED' && (
                  <div className="rounded-lg bg-[#EBF3EE] border border-[#CDE0D5] p-3 text-xs text-[#234735] flex items-center gap-2">
                    <Check className="w-4 h-4 shrink-0" />
                    <span>
                      PO senilai <strong>{agentResponse.formattedTotal}</strong> telah disetujui dan dikirim.
                    </span>
                  </div>
                )}

                {poApprovalStatus === 'REJECTED' && (
                  <div className="rounded-lg bg-[#F1EFEA] p-3 text-xs text-[#5C6066]">
                    Pengajuan PO dibatalkan.
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}