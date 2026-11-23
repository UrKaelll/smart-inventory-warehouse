import { NextResponse } from 'next/server';
import { GoogleGenAI, Type } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function POST(request) {
  try {
    const body = await request.json();
    const { inventoryData, sourceName, userPrompt } = body;

    if (!inventoryData || !Array.isArray(inventoryData) || inventoryData.length === 0) {
      return NextResponse.json({
        status: 'FAILURE',
        message: 'Data CSV kosong atau tidak dapat dibaca oleh sistem.',
        errors: ['File tidak memiliki baris data yang valid.']
      });
    }

    // ==========================================================
    // TAHAP 1: PEMERIKSAAN KUALITAS DATA (GUARDRAIL / FAILURE)
    // ==========================================================
    const errors = [];
    const seenSkus = new Set();

    inventoryData.forEach((row, index) => {
      const lineNumber = index + 2;
      const sku = row.SKU ? String(row.SKU).trim() : '';
      const nama = row.Nama_Barang ? String(row.Nama_Barang).trim() : '';
      const stok = Number(row.Stok_Saat_Ini);
      const harga = Number(row.Harga);
      const supplier = row.Supplier ? String(row.Supplier).trim() : '';

      if (!sku || !/^SKU-\d+$/i.test(sku)) {
        errors.push(`Baris ${lineNumber}: Format SKU tidak valid ("${sku || 'Kosong'}"). Harus berformat SKU-XXX.`);
      }
      if (sku && seenSkus.has(sku.toUpperCase())) {
        errors.push(`Baris ${lineNumber}: Terdeteksi duplikasi kode SKU (${sku}).`);
      } else if (sku) {
        seenSkus.add(sku.toUpperCase());
      }
      if (row.Stok_Saat_Ini === '' || row.Stok_Saat_Ini === null || isNaN(stok) || stok < 0) {
        errors.push(`Baris ${lineNumber} (${sku || nama}): Nilai stok tidak valid atau minus (${row.Stok_Saat_Ini}).`);
      }
      if (row.Harga === '' || row.Harga === null || isNaN(harga) || harga <= 0) {
        errors.push(`Baris ${lineNumber} (${sku || nama}): Data harga kosong atau tidak valid.`);
      }
      if (!supplier) {
        errors.push(`Baris ${lineNumber} (${sku || nama}): Data Supplier tidak ditemukan/kosong.`);
      }
    });

    if (errors.length > 0) {
      return NextResponse.json({
        status: 'FAILURE',
        sourceName,
        message: `Proses dihentikan! Ditemukan ${errors.length} anomali kualitas data pada "${sourceName}". Harap perbaiki baris bermasalah sebelum AI melanjutkan analisis.`,
        errors
      });
    }

    // ==========================================================
    // TAHAP 2: DETEKSI OTOMATIS MODEL GEMINI YANG AKTIF DI AKUN
    // ==========================================================
    let availableFlashModels = [];
    try {
      const modelPager = await ai.models.list();
      for await (const m of modelPager) {
        const cleanName = m.name.replace(/^models\//, '');
        if (cleanName.includes('gemini') && cleanName.includes('flash') && !cleanName.includes('image') && !cleanName.includes('audio')) {
          availableFlashModels.push(cleanName);
        }
      }
    } catch (listErr) {
      console.warn('Gagal mengambil daftar model otomatis, menggunakan daftar default:', listErr.message);
    }

    // Gabungkan hasil deteksi otomatis dengan kandidat utama
    const candidateModels = Array.from(
      new Set([
        ...availableFlashModels,
        'gemini-3.8-flash',
        'gemini-3-flash-preview',
        'gemini-2.5-flash'
      ])
    );

    const systemInstruction = `
Kamu adalah "Smart Inventory AI Agent", asisten cerdas pengelola gudang dan pengadaan barang.
Tugasmu adalah menjawab pertanyaan apa pun dari Manajer Gudang secara akurat berdasarkan DATA STOK GUDANG REAL-TIME yang diberikan, maupun pengetahuan logistik/bisnis umum.

Aturan Analisis & Purchase Order (PO):
1. Jika pengguna meminta pemeriksaan stok, restock, atau pembuatan draf PO:
   - Identifikasi semua barang dengan Stok_Saat_Ini <= Batas_Minimum.
   - Hitung Jumlah_Pesan optimal dengan rumus: (Batas_Minimum * 2) - Stok_Saat_Ini.
   - Hitung Total_Biaya per item = Jumlah_Pesan * Harga.
   - Setel "needsPoApproval" menjadi true, isi array "poDraft", dan tulis pesan konfirmasi yang menyebutkan jumlah barang & total biaya dalam Rupiah.
2. Jika pengguna hanya bertanya hal analitis atau umum (contoh: "Barang apa yang paling mahal?", "Berapa total nilai seluruh aset stok di gudang?", "Supplier mana yang paling banyak menyuplai barang?", atau sapaan biasa):
   - Jawab pertanyaan pengguna dengan jelas, cerdas, dan lengkap pada field "aiReply".
   - Setel "needsPoApproval" menjadi false dan kosongkan "poDraft".
`;

    const promptPayload = `
Sumber File: ${sourceName}
DATA STOK GUDANG SAAT INI (JSON):
${JSON.stringify(inventoryData, null, 2)}

PERTANYAAN / INSTRUKSI PENGGUNA:
"${userPrompt || 'Periksa stok gudang dan siapkan draf PO jika ada barang di bawah batas aman.'}"
    `;

    const generationConfig = {
      systemInstruction,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          aiReply: {
            type: Type.STRING,
            description: 'Jawaban lengkap, ramah, dan analitis dari AI untuk menjawab pertanyaan pengguna.'
          },
          needsPoApproval: {
            type: Type.BOOLEAN,
            description: 'Bernilai true HANYA JIKA pengguna meminta restock/PO dan ada barang yang perlu dipesan.'
          },
          poDraft: {
            type: Type.ARRAY,
            description: 'Daftar barang yang diajukan dalam draf Purchase Order.',
            items: {
              type: Type.OBJECT,
              properties: {
                SKU: { type: Type.STRING },
                Nama_Barang: { type: Type.STRING },
                Supplier: { type: Type.STRING },
                Jumlah_Pesan: { type: Type.NUMBER },
                Total_Biaya: { type: Type.NUMBER }
              },
              required: ['SKU', 'Nama_Barang', 'Supplier', 'Jumlah_Pesan', 'Total_Biaya']
            }
          }
        },
        required: ['aiReply', 'needsPoApproval', 'poDraft']
      }
    };

    let response = null;
    let lastError = null;

    for (const modelName of candidateModels) {
      // Coba hingga 2 kali per model jika server sedang sibuk (503)
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          response = await ai.models.generateContent({
            model: modelName,
            contents: promptPayload,
            config: generationConfig
          });
          if (response && response.text) break;
        } catch (err) {
          lastError = err;
          const errMsg = String(err.message);
          if (errMsg.includes('503') || errMsg.includes('UNAVAILABLE')) {
            await sleep(1200); // Tunggu 1.2 detik lalu coba ulang
            continue;
          }
          break; // Jika 404 / error lain, langsung pindah ke model berikutnya
        }
      }
      if (response && response.text) break;
    }

    if (!response || !response.text) {
      throw lastError || new Error('Server Gemini sedang sibuk. Silakan klik kirim ulang dalam beberapa detik.');
    }

    const aiResult = JSON.parse(response.text);

    if (aiResult.needsPoApproval && aiResult.poDraft && aiResult.poDraft.length > 0) {
      const grandTotal = aiResult.poDraft.reduce((sum, item) => sum + Number(item.Total_Biaya || 0), 0);
      const formattedTotal = new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 0
      }).format(grandTotal);

      return NextResponse.json({
        status: 'CONTROL_APPROVAL_NEEDED',
        sourceName,
        message: aiResult.aiReply,
        poDraft: aiResult.poDraft,
        grandTotal,
        formattedTotal
      });
    }

    return NextResponse.json({
      status: 'AI_ANSWER',
      sourceName,
      message: aiResult.aiReply
    });

  } catch (error) {
    console.error('Gemini API Error:', error);
    return NextResponse.json(
      {
        status: 'FAILURE',
        message: 'Terjadi kendala koneksi ke server Gemini AI.',
        errors: [error.message]
      },
      { status: 500 }
    );
  }
}