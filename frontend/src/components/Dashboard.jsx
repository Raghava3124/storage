import React, { useState, useEffect, useContext } from 'react';
import axios from 'axios';
import { AuthContext } from '../context/AuthContext';
import { LogOut, UploadCloud, Trash2, HardDrive, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import UploadArea from './UploadArea';
import FileGrid from './FileGrid';
import { formatSize } from '../utils';

const Dashboard = () => {
    const { user, logout } = useContext(AuthContext);
    const [files, setFiles] = useState([]);
    const [trashedFiles, setTrashedFiles] = useState([]);
    const [viewMode, setViewMode] = useState('active'); // 'active' | 'trash'
    const [totalStorage, setTotalStorage] = useState(0);
    const [isUploading, setIsUploading] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    const fetchFiles = async () => {
        try {
            setIsLoading(true);
            const token = localStorage.getItem('token');
            const headers = { Authorization: `Bearer ${token}` };

            // Get Active files
            const res = await axios.get('http://localhost:5000/api/files', { headers });
            setFiles(res.data);

            // Get Trashed files
            const trashedRes = await axios.get('http://localhost:5000/api/files/trashed', { headers });
            setTrashedFiles(trashedRes.data);

            // Get Total Storage
            const storageRes = await axios.get('http://localhost:5000/api/files/storage', { headers });
            setTotalStorage(storageRes.data.totalBytes);

        } catch (err) {
            console.error('Error fetching data:', err);
            toast.error('Failed to load files.');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchFiles();
    }, []);

    const handleFileUpload = async (file) => {
        setIsUploading(true);
        const formData = new FormData();
        formData.append('file', file);

        let toastId;
        try {
            const token = localStorage.getItem('token');
            toastId = toast.loading('Uploading to Telegram...');
            await axios.post('http://localhost:5000/api/files/upload', formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                    'Authorization': `Bearer ${token}`
                }
            });
            toast.success('File uploaded successfully!', { id: toastId });
            await fetchFiles();
        } catch (err) {
            console.error('Upload error:', err);
            if (toastId) toast.error('Failed to upload file. Check if Telegram bot is configured.', { id: toastId });
            else toast.error('Failed to upload file.');
        } finally {
            setIsUploading(false);
        }
    };

    const handleDownload = (fileId) => {
        window.open(`http://localhost:5000/api/files/download/${fileId}`, '_blank');
    };

    const handleDelete = async (fileId) => {
        try {
            const token = localStorage.getItem('token');
            await axios.delete(`http://localhost:5000/api/files/${fileId}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            toast.success('File moved to trash.');
            await fetchFiles();
        } catch (err) {
            console.error('Delete error:', err);
            toast.error('Failed to move file to trash.');
        }
    };

    const handleRestore = async (fileId) => {
        try {
            const token = localStorage.getItem('token');
            await axios.put(`http://localhost:5000/api/files/restore/${fileId}`, {}, {
                headers: { Authorization: `Bearer ${token}` }
            });
            toast.success('File restored successfully.');
            await fetchFiles();
        } catch (err) {
            console.error('Restore error:', err);
            toast.error('Failed to restore file.');
        }
    };

    const handlePermanentDelete = async (fileId) => {
        if (!window.confirm("Are you sure you want to permanently delete this file? This action cannot be undone.")) return;

        try {
            const token = localStorage.getItem('token');
            await axios.delete(`http://localhost:5000/api/files/permanent/${fileId}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            toast.success('File deleted permanently.');
            await fetchFiles();
        } catch (err) {
            console.error('Permanent delete error:', err);
            toast.error('Failed to permanently delete file.');
        }
    };

    return (
        <div>
            <nav className="navbar" style={{ padding: '1rem 2rem' }}>
                <div className="flex items-center gap-4">
                    <UploadCloud className="text-primary" size={28} />
                    <h2 className="gradient-text" style={{ margin: 0 }}>TeleCloud</h2>

                    {/* Storage Indicator */}
                    <div className="flex items-center gap-2 ml-4" style={{ background: 'rgba(var(--primary-rgb), 0.1)', padding: '6px 12px', borderRadius: '20px', fontSize: '0.85rem' }}>
                        <HardDrive size={16} className="text-primary" style={{ color: "var(--primary)" }} />
                        <span style={{ color: "var(--primary)", fontWeight: 500 }}>
                            {formatSize(totalStorage)} Used
                        </span>
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    <span style={{ color: 'var(--text-muted)' }}>{user.email}</span>
                    <button className="btn btn-secondary" onClick={logout} style={{ padding: '0.5rem 1rem' }}>
                        <LogOut size={16} /> Logout
                    </button>
                </div>
            </nav>

            <UploadArea onFileUpload={handleFileUpload} isUploading={isUploading} />

            <div className="mt-4">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
                    <div className="flex gap-4">
                        <h3
                            style={{
                                fontSize: '1.2rem',
                                cursor: 'pointer',
                                color: viewMode === 'active' ? 'var(--text-main)' : 'var(--text-muted)',
                                borderBottom: viewMode === 'active' ? '2px solid var(--primary)' : 'none',
                                paddingBottom: '0.4rem',
                                transition: 'all 0.2s'
                            }}
                            onClick={() => setViewMode('active')}
                        >
                            My Files
                        </h3>
                        <h3
                            style={{
                                fontSize: '1.2rem',
                                cursor: 'pointer',
                                color: viewMode === 'trash' ? 'var(--danger)' : 'var(--text-muted)',
                                borderBottom: viewMode === 'trash' ? '2px solid var(--danger)' : 'none',
                                paddingBottom: '0.4rem',
                                transition: 'all 0.2s'
                            }}
                            onClick={() => setViewMode('trash')}
                        >
                            <Trash2 size={18} style={{ display: 'inline', marginRight: '6px' }} />
                            Recycle Bin
                        </h3>
                    </div>
                </div>

                {viewMode === 'trash' && (
                    <div className="mb-4" style={{ background: 'rgba(239, 68, 68, 0.1)', padding: '12px', borderRadius: '8px', color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem' }}>
                        <AlertCircle size={18} />
                        Files in the Recycle Bin will be permanently deleted after 30 days.
                    </div>
                )}

                {isLoading ? (
                    <div className="flex items-center justify-center py-12">
                        <div className="loader" style={{ width: '50px', height: '50px', borderWidth: '4px' }}></div>
                    </div>
                ) : (
                    <FileGrid
                        files={viewMode === 'active' ? files : trashedFiles}
                        viewMode={viewMode}
                        onDownload={handleDownload}
                        onDelete={handleDelete}
                        onRestore={handleRestore}
                        onPermanentDelete={handlePermanentDelete}
                    />
                )}
            </div>
        </div>
    );
};

export default Dashboard;
