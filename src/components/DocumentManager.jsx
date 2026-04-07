import React, { useState, useEffect } from 'react';
import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';
import { saveAs } from 'file-saver';
import { format } from 'date-fns';
import { 
  UploadCloud, 
  FileDown, 
  History, 
  FileText, 
  AlertCircle, 
  Download, 
  Trash2,
  Trash,
  CheckCircle2, 
  Loader2,
  CloudCheck,
  FileType,
  FileCode
} from 'lucide-react';
import { supabase } from '../lib/supabase';

const DocumentManager = () => {
  const [officerName, setOfficerName] = useState('');
  const [procurementTitle, setProcurementTitle] = useState('');
  const [activeTemplate, setActiveTemplate] = useState(null);
  const [history, setHistory] = useState([]);
  const [officers, setOfficers] = useState([]);
  
  const [isGenerating, setIsGenerating] = useState(false);
  const [isDownloading, setIsDownloading] = useState(null);
  const [isConverting, setIsConverting] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    setIsLoading(true);
    try {
      const { data: officersData } = await supabase.from('officers').select('*').order('name');
      setOfficers(officersData || []);

      const { data: templateData } = await supabase
        .from('document_templates')
        .select('*')
        .eq('is_active', true)
        .single();
      
      if (templateData) {
        setActiveTemplate(templateData);
      }

      await fetchHistory();
    } catch (err) {
      console.error("Error fetching initial data", err);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchHistory = async () => {
    const { data } = await supabase
      .from('document_history')
      .select('*')
      .order('created_at', { ascending: false });
    setHistory(data || []);
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file || !file.name.endsWith('.docx')) {
      alert('Pilih file .docx yang valid.');
      return;
    }

    setIsLoading(true);
    try {
      const fileName = `${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(`templates/${fileName}`, file);

      if (uploadError) throw uploadError;

      await supabase.from('document_templates').update({ is_active: false }).neq('name', '');

      const { data: newTemplate, error: dbError } = await supabase
        .from('document_templates')
        .insert({
          name: file.name,
          storage_path: `templates/${fileName}`,
          is_active: true
        })
        .select()
        .single();

      if (dbError) throw dbError;

      setActiveTemplate(newTemplate);
      alert('Template berhasil diunggah!');
    } catch (err) {
      console.error(err);
      alert('Gagal mengunggah template.');
    } finally {
      setIsLoading(false);
    }
  };

  const generateDocument = async () => {
    if (!activeTemplate) {
      alert('Tolong unggah file template .docx terlebih dahulu.');
      return;
    }
    
    if (!officerName || !procurementTitle) {
      alert('Mohon pilih Nama Officer dan isi Judul Pengadaan.');
      return;
    }

    setIsGenerating(true);

    try {
      const { data: blobData, error: downloadErr } = await supabase.storage
        .from('documents')
        .download(activeTemplate.storage_path);

      if (downloadErr) throw downloadErr;

      const arrayBuffer = await blobData.arrayBuffer();
      const zip = new PizZip(arrayBuffer);
      const doc = new Docxtemplater(zip, {
        paragraphLoop: true,
        linebreaks: true,
        delimiters: { start: '{{', end: '}}' }
      });

      doc.render({
        officer_name: officerName,
        procurement_title: procurementTitle,
      });

      const outBlob = doc.getZip().generate({
        type: 'blob',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });

      const fileName = `Dokumen_${procurementTitle.replace(/\s+/g, '_')}_${format(new Date(), 'yyyyMMdd_HHmm')}.docx`;

      const storagePath = `history/${Date.now()}_${fileName}`;
      await supabase.storage.from('documents').upload(storagePath, outBlob);

      await supabase.from('document_history').insert({
        officer_name: officerName,
        procurement_title: procurementTitle,
        file_name: fileName,
        storage_path: storagePath
      });

      // NO LONGER DOWNLOADING AUTOMATICALLY
      alert('Dokumen berhasil digenerate dan disimpan ke Cloud!');
      
      fetchHistory();
      setOfficerName('');
      setProcurementTitle('');

    } catch (error) {
      console.error('Error generating document:', error);
      alert(`Terjadi kesalahan: ${error.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const downloadFile = async (id, path, fileName) => {
    setIsDownloading(id);
    try {
      const { data, error } = await supabase.storage
        .from('documents')
        .download(path);
      
      if (error) throw error;
      saveAs(data, fileName);
    } catch (err) {
      console.error(err);
      alert('Gagal mengunduh file.');
    } finally {
      setIsDownloading(null);
    }
  };

  const convertToPdf = async (recordId) => {
    setIsConverting(recordId);
    try {
      // Panggil kembali Supabase Edge Function (yang sudah dipasang ConvertAPI)
      const { data, error } = await supabase.functions.invoke('convert-docx-to-pdf', {
        body: { record_id: recordId }
      });

      if (error) {
        throw new Error(error.message || 'Gagal menghubungi server konversi.');
      }

      if (data && data.success === false) {
        throw new Error(data.error || 'Terjadi kesalahan internal pada mesin konversi.');
      }

      alert('Konversi PDF Berhasil Menggunakan ConvertAPI! 💎');
      fetchHistory();
    } catch (err) {
      console.error(err);
      alert(`Gagal Konversi: ${err.message}`);
    } finally {
      setIsConverting(null);
    }
  };

  const deleteRecord = async (id, paths) => {
    if (!confirm('Hapus riwayat ini? File di storage juga akan dihapus.')) return;
    
    try {
      await supabase.from('document_history').delete().eq('id', id);
      await supabase.storage.from('documents').remove(paths);
      fetchHistory();
    } catch (err) {
      console.error(err);
    }
  };

  const bulkDelete = async () => {
    if (!confirm('Hapus SEMUA riwayat dokumen? Tindakan ini tidak bisa dibatalkan.')) return;
    
    try {
      const { data } = await supabase.from('document_history').select('storage_path, pdf_storage_path');
      const paths = data.flatMap(d => [d.storage_path, d.pdf_storage_path].filter(Boolean));

      await supabase.from('document_history').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      if (paths.length > 0) {
        await supabase.storage.from('documents').remove(paths);
      }
      fetchHistory();
    } catch (err) {
      console.error(err);
    }
  };

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <Loader2 size={48} className="animate-spin" color="var(--primary-color)" />
      </div>
    );
  }

  return (
    <div className="grid-layout">
      <div className="form-section">
        <div className="card" style={{ marginBottom: '2rem' }}>
          <h2 className="card-title"> <FileText size={20} /> Template Cloud (ADo)</h2>
          <div className="form-group">
            <label>Template Tersimpan</label>
            <div className={`upload-area ${activeTemplate ? 'active' : ''}`} onClick={() => document.getElementById('template-upload').click()}>
              {activeTemplate ? (
                <>
                  <CheckCircle2 size={32} color="#10b981" />
                  <div className="upload-text">Template Aktif Terpasang</div>
                  <div className="file-name">{activeTemplate.name}</div>
                </>
              ) : (
                <>
                  <UploadCloud size={32} />
                  <div className="upload-text">Klik untuk mengunggah template</div>
                </>
              )}
              <input id="template-upload" type="file" accept=".docx" style={{ display: 'none' }} onChange={handleFileUpload} />
            </div>
          </div>
        </div>

        <div className="card">
          <h2 className="card-title">Input Data Pengadaan</h2>
          
          <div className="form-group">
            <label>Pilih Nama Officer</label>
            <select className="form-select" value={officerName} onChange={(e) => setOfficerName(e.target.value)}>
              <option value="">-- Pilih Petugas --</option>
              {officers.map(o => <option key={o.id} value={o.name}>{o.name}</option>)}
            </select>
          </div>

          <div className="form-group">
            <label>Judul Pengadaan</label>
            <input type="text" placeholder="Contoh: Pengadaan UPS 2026" value={procurementTitle} onChange={(e) => setProcurementTitle(e.target.value)} />
          </div>

          <button className="btn-primary" onClick={generateDocument} disabled={isGenerating || !activeTemplate || !officerName || !procurementTitle}>
            {isGenerating ? <><Loader2 size={18} className="animate-spin" /> Memproses...</> : <><CloudCheck size={18} /> Generate & Simpan di Cloud</>}
          </button>
        </div>
      </div>

      <div className="history-section">
        <div className="card" style={{ height: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
            <h2 className="card-title" style={{ marginBottom: 0 }}><History size={20} /> Riwayat Dokumen</h2>
            {history.length > 0 && <button onClick={bulkDelete} style={{ background: 'none', color: '#ef4444', fontSize: '0.8rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.25rem' }}><Trash2 size={14} /> Clear All</button>}
          </div>
          
          <div className="history-list">
            {history.map((record) => (
              <div key={record.id} className="history-item" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '0.75rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div className="history-info">
                    <div className="history-title">{record.file_name}</div>
                    <div className="history-meta">
                      <span>{record.officer_name}</span> • <span>{format(new Date(record.created_at), 'dd MMM, HH:mm')}</span>
                    </div>
                  </div>
                  <button onClick={() => deleteRecord(record.id, [record.storage_path, record.pdf_storage_path].filter(Boolean))} style={{ color: '#9ca3af', background: 'none' }}><Trash size={16} /></button>
                </div>
                
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button 
                    className="btn-secondary" 
                    onClick={() => downloadFile(record.id, record.storage_path, record.file_name)}
                    style={{ flex: 1, padding: '0.5rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}
                    disabled={isDownloading === record.id}
                  >
                    {isDownloading === record.id ? <Loader2 size={14} className="animate-spin" /> : <FileCode size={14} />}
                    Download DOCX
                  </button>

                  {record.pdf_storage_path ? (
                    <button 
                      className="btn-primary" 
                      onClick={() => downloadFile(`${record.id}_pdf`, record.pdf_storage_path, record.file_name.replace('.docx', '.pdf'))}
                      style={{ flex: 1, padding: '0.5rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', backgroundColor: '#ef4444' }}
                      disabled={isDownloading === `${record.id}_pdf`}
                    >
                      {isDownloading === `${record.id}_pdf` ? <Loader2 size={14} className="animate-spin" /> : <FileType size={14} />}
                      Download PDF
                    </button>
                  ) : (
                    <button 
                      className="btn-primary" 
                      onClick={() => convertToPdf(record.id)}
                      style={{ flex: 1, padding: '0.5rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', backgroundColor: '#6366f1' }}
                      disabled={isConverting === record.id}
                    >
                      {isConverting === record.id ? <Loader2 size={14} className="animate-spin" /> : <FileType size={14} />}
                      Convert to PDF
                    </button>
                  )}
                </div>
              </div>
            ))}
            {history.length === 0 && <div className="empty-state"><CloudCheck size={48} /><p>Riwayat Cloud Kosong.</p></div>}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DocumentManager;
