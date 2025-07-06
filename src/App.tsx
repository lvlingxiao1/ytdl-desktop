import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api';
import { join } from '@tauri-apps/api/path';
import { open } from '@tauri-apps/api/dialog';
import { Command, open as openFolder } from '@tauri-apps/api/shell';

// Define types from response of yt-dlp
interface VideoFormat {
	format_id: string;
	ext: string;
	acodec: string;
	vcodec: string;
	width?: number;
	height?: number;
	fps?: number;
	vbr?: number; // video bitrate
	abr?: number; // audio bitrate
	tbr?: number; // total bitrate
	filesize: number;
}

interface VideoInfo {
	formats: VideoFormat[];
	title: string;
	url: string;
}

interface DownloadProgress {
	[key: string]: string | number;
}

/**
 * Display human readable sizes
 * @param {number} size - Size in bytes
 */
function displaySize(size: number | undefined): string {
	if (size === undefined || isNaN(size)) return '';
	if (size < 1024) {
		return size + 'B';
	} else if (size < 1048576) {
		return (size / 1024).toFixed(2) + 'KB';
	} else if (size < 1073741824) {
		return (size / 1048576).toFixed(2) + 'MB';
	} else {
		return (size / 1073741824).toFixed(2) + 'GB';
	}
}

const App = () => {
	const [url, setUrl] = useState<string>('');
	const [saveDir, setSaveDir] = useState<string>('');
	const [requireVideo, setRequireVideo] = useState<boolean>(false);
	const [requireAudio, setRequireAudio] = useState<boolean>(false);
	const [info, setInfo] = useState<VideoInfo | null>(null);
	const [isLoading, setIsLoading] = useState<boolean>(false);
	const [downloadProgress, setDownloadProgress] = useState<DownloadProgress>({});

	// Load save directory from localStorage on component mount
	useEffect(() => {
		const loadSaveDir = async () => {
			try {
				// Try to get saved directory from localStorage
				const savedDir = localStorage.getItem('saveDir');
				if (savedDir) {
					setSaveDir(savedDir);
				} else {
					// Default to downloads directory
					const downloadsDir = (await invoke('get_downloads_dir')) as string;
					setSaveDir(downloadsDir as string);
					localStorage.setItem('saveDir', downloadsDir as string);
				}
			} catch (err) {
				console.error('Failed to load save directory:', err);
				setSaveDir('C:\\');
			}
		};

		loadSaveDir();
	}, []);

	const handleGetInfo = async (): Promise<void> => {
		if (!url) return;

		setIsLoading(true);
		try {
			const cmd = Command.sidecar('bin/yt-dlp', ['--dump-json', url]);
			cmd.stdout.on('data', (line) => {
				console.log('[stdout]', line);
				const info = JSON.parse(line);
				info['url'] = url;
				setInfo(info);
			});
			cmd.stderr.on('data', (line) => {
				console.error('[stderr]', line);
			});
			cmd.on('close', ({ code }) => {
				console.log(`[close] exited with code ${code}`);
				setIsLoading(false);
			});
			cmd.on('error', (e) => {
				console.error('[error]', e);
			});
			await cmd.spawn();
		} catch (err) {
			console.error(err);
			setIsLoading(false);
		}
	};

	const handleChangeSaveDir = async (): Promise<void> => {
		try {
			// Open directory selection dialog using our Rust command
			// const selected = await invoke('select_folder');
			const selected = await open({
				directory: true,
				multiple: false,
				title: 'Select a folder to save the downloads',
			});

			if (selected) {
				setSaveDir(selected as string);
				localStorage.setItem('saveDir', selected as string);
			}
		} catch (err) {
			console.error('Failed to select directory:', err);
		}
	};

	const handleOpenSaveDir = async (): Promise<void> => {
		if (saveDir) {
			try {
				await invoke('open_folder', { path: saveDir });
			} catch (err) {
				console.error('Failed to open directory:', err);
			}
		}
	};

	const handleDownload = async (format: VideoFormat): Promise<void> => {
		try {
			if (!info) return;

			const extName =
				format.vcodec !== 'none'
					? format.ext
					: format.ext === 'mp4' || format.ext === 'm4a'
					? 'm4a'
					: format.ext === 'webm'
					? 'webm'
					: 'unknown';

			// Create a safe filename
			const safeTitle = info.title.replace(/[\"\*\:\<\>\?\/\\\|]/g, '_');
			const filename = await join(saveDir, `${safeTitle}-${format.format_id}.${extName}`);

			// Initialize progress for this format
			setDownloadProgress((prev) => ({
				...prev,
				[format.format_id]: '0%',
			}));

			try {
				const cmd = Command.sidecar('bin/yt-dlp', [
					'-f',
					format.format_id,
					'-o',
					filename,
					'--newline',
					info.url,
				]);
				cmd.stdout.on('data', (line: string) => {
					if (line.includes('[download]') && line.includes('%')) {
						const percent = line.split(/\s+/).find((word) => word.endsWith('%'));
						if (percent) {
							setDownloadProgress((prev) => ({
								...prev,
								[format.format_id]: percent,
							}));
						}
					}
				});
				cmd.stderr.on('data', (line) => {
					console.error('[download stderr]', line);
				});

				cmd.on('close', ({ code, signal }) => {
					console.log(`process exited with code ${code} signal ${signal}`);
					if (code === 0) {
						setDownloadProgress((prev) => ({
							...prev,
							[format.format_id]: '完成',
						}));
					} else {
						setDownloadProgress((prev) => ({
							...prev,
							[format.format_id]: `错误: ${code}`,
						}));
					}
				});

				await cmd.spawn();
			} catch (err: any) {
				console.error('Download error:', err);
				setDownloadProgress((prev) => ({
					...prev,
					[format.format_id]: `Error: ${err}`,
				}));
			}
		} catch (err: any) {
			console.error(err);
			setDownloadProgress((prev) => ({
				...prev,
				[format.format_id]: `Error: ${err.message || err}`,
			}));
		}
	};

	// Filter formats based on checkbox selections
	const filteredFormats =
		info?.formats?.filter(
			(format) => (format.acodec !== 'none' || !requireAudio) && (format.vcodec !== 'none' || !requireVideo)
		) || [];

	return (
		<div>
			<h1>YouTube 下载器</h1>

			<div className="search-row">
				<input
					type="text"
					value={url}
					onChange={(e) => setUrl(e.target.value)}
					placeholder="Enter YouTube URL"
				/>
				<button onClick={handleGetInfo}>Get Info</button>
			</div>

			<div className="options-row">
				<span>保存位置: </span>
				<a onClick={handleOpenSaveDir}>{saveDir || '/'}</a>
				<button onClick={handleChangeSaveDir}>更改</button>
				<button onClick={() => openFolder(saveDir)}>打开</button>
			</div>

			<div className="options-row">
				<input
					type="checkbox"
					id="require-video"
					checked={requireVideo}
					onChange={(e) => setRequireVideo(e.target.checked)}
				/>
				<label htmlFor="require-video">视频</label>
				&nbsp;&nbsp;&nbsp;
				<input
					type="checkbox"
					id="require-audio"
					checked={requireAudio}
					onChange={(e) => setRequireAudio(e.target.checked)}
				/>
				<label htmlFor="require-audio">音频</label>
			</div>

			<div id="info">
				{isLoading && <h3>分析中...</h3>}

				{info && !isLoading && (
					<>
						<h3>{info.title}</h3>
						<table>
							<thead>
								<tr>
									<th>Id</th>
									<th>格式</th>
									<th>音频</th>
									<th>视频</th>
									<th>宽</th>
									<th>高</th>
									<th>FPS</th>
									<th>码率</th>
									<th>音频码率</th>
									<th>文件大小</th>
									<th>下载</th>
								</tr>
							</thead>
							<tbody>
								{filteredFormats.map((format) => (
									<tr key={format.format_id}>
										<td>{format.format_id}</td>
										<td>{format.ext}</td>
										<td>{format.acodec !== 'none' ? '√' : ''}</td>
										<td>{format.vcodec !== 'none' ? '√' : ''}</td>
										<td>{format.width || ''}</td>
										<td>{format.height || ''}</td>
										<td>{format.fps || ''}</td>
										<td>{format.tbr || ''}</td>
										<td>{format.abr || ''}</td>
										<td>{displaySize(format.filesize || 0)}</td>
										<td>
											{downloadProgress[format.format_id] ? (
												<span>{downloadProgress[format.format_id]}</span>
											) : (
												<button onClick={() => handleDownload(format)}>下载</button>
											)}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</>
				)}
			</div>
		</div>
	);
};

export default App;
