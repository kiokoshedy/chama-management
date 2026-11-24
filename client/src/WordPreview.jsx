import { useEffect, useState } from 'react';
import DOMPurify from 'dompurify';
import { Download, FileText, Loader2 } from 'lucide-react';

export const isDocx = (file) =>
  !!file &&
  ((file.name || '').toLowerCase().endsWith('.docx') ||
    file.mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');

export default function WordPreview({ blob, name, url, onDownload }) {
  const [html, setHtml] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setHtml('');
    setError('');
    setLoading(true);

    if (!blob || !isDocx({ name })) {
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }

    (async () => {
      try {
        const mammoth = (await import('mammoth')).default;
        const result = await mammoth.convertToHtml({ arrayBuffer: await blob.arrayBuffer() });
        if (!cancelled) setHtml(DOMPurify.sanitize(result.value));
      } catch (e) {
        if (!cancelled) setError(e.message || 'The document could not be read.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [blob, name]);

  if (loading) {
    return (
      <div className="word-preview-state">
        <Loader2 size={26} className="spin-ico" />
        <strong>Preparing the document…</strong>
      </div>
    );
  }

  if (!isDocx({ name })) {
    return (
      <div className="word-preview-state">
        <div className="icon-tile blue">
          <FileText size={22} />
        </div>
        <h3>Inline preview not available</h3>
        <p>Legacy .doc files can't be previewed inline — download the file to read it.</p>
        {url && (
          <button className="btn" onClick={onDownload}>
            <Download size={16} />
            Download
          </button>
        )}
      </div>
    );
  }

  if (error) {
    return (
      <div className="word-preview-state">
        <div className="icon-tile amber">
          <FileText size={22} />
        </div>
        <h3>Could not preview this document</h3>
        <p>{error}</p>
        {url && (
          <button className="btn" onClick={onDownload}>
            <Download size={16} />
            Download instead
          </button>
        )}
      </div>
    );
  }

  return <div className="word-preview" dangerouslySetInnerHTML={{ __html: html }} />;
}
