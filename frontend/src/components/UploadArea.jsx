import React, { useState, useRef } from 'react';
import { UploadCloud } from 'lucide-react';

const UploadArea = ({ onFileUpload, isUploading }) => {
    const [dragActive, setDragActive] = useState(false);
    const fileInputRef = useRef(null);

    const handleDrag = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === 'dragenter' || e.type === 'dragover') {
            setDragActive(true);
        } else if (e.type === 'dragleave') {
            setDragActive(false);
        }
    };

    const handleDrop = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            await onFileUpload(e.dataTransfer.files[0]);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleChange = async (e) => {
        e.preventDefault();
        if (e.target.files && e.target.files[0]) {
            await onFileUpload(e.target.files[0]);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    return (
        <div
            className={`upload-area ${dragActive ? 'drag-active' : ''}`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current.click()}
        >
            <input
                type="file"
                ref={fileInputRef}
                style={{ display: 'none' }}
                onChange={handleChange}
            />
            {isUploading ? (
                <div className="flex items-center justify-center flex-col gap-4">
                    <div className="loader" style={{ width: '40px', height: '40px', borderWidth: '4px' }}></div>
                    <p className="gradient-text">Uploading to Telegram...</p>
                </div>
            ) : (
                <div>
                    <UploadCloud size={64} className="text-primary mx-auto mb-4" style={{ color: 'var(--primary)', margin: '0 auto 1rem' }} />
                    <h3 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>Drag & Drop files here</h3>
                    <p style={{ color: 'var(--text-muted)' }}>or click to browse from your computer</p>
                </div>
            )}
        </div>
    );
};

export default UploadArea;
