import React, { useState, useEffect } from 'react';
const { ipcRenderer, shell } = require('electron');
const ytdl = require('ytdl-core');
const path = require('path');
const fs = require('fs');

// Define types for the video info and formats
interface VideoFormat {
  itag: number;
  container: string;
  hasAudio: boolean;
  hasVideo: boolean;
  width?: number;
  height?: number;
  fps?: number;
  bitrate?: number;
  audioBitrate?: number;
  contentLength?: string;
}

interface VideoDetails {
  title: string;
  video_url: string;
}

interface VideoInfo {
  formats: VideoFormat[];
  videoDetails: VideoDetails;
}

interface DownloadProgress {
  [key: number]: string | number;
}

/**
 * Display human readable sizes
 * @param {number} size - Size in bytes
 */
function displaySize(size: number | undefined): string {
  if (size === undefined || isNaN(size)) return "";
  if (size < 1024) {
    return size + "B";
  } else if (size < 1048576) {
    return (size / 1024).toFixed(2) + "KB";
  } else if (size < 1073741824) {
    return (size / 1048576).toFixed(2) + "MB";
  } else {
    return (size / 1073741824).toFixed(2) + "GB";
  }
}

const App: React.FC = () => {
  const [url, setUrl] = useState<string>('');
  const [saveDir, setSaveDir] = useState<string>('');
  const [requireVideo, setRequireVideo] = useState<boolean>(true);
  const [requireAudio, setRequireAudio] = useState<boolean>(true);
  const [info, setInfo] = useState<VideoInfo | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress>({});

  // Set up IPC listeners
  useEffect(() => {
    ipcRenderer.on('save-dir', (_e: any, arg: string) => {
      setSaveDir(arg);
    });

    // Load save directory on component mount
    ipcRenderer.send('load-save-dir');

    // Clean up listeners on unmount
    return () => {
      ipcRenderer.removeAllListeners('save-dir');
    };
  }, []);

  const handleGetInfo = async (): Promise<void> => {
    if (!url) return;
    
    setIsLoading(true);
    try {
      const videoInfo = await ytdl.getInfo(url);
      setInfo(videoInfo);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleChangeSaveDir = (): void => {
    ipcRenderer.send('set-save-dir');
  };

  const handleOpenSaveDir = (): void => {
    if (saveDir) {
      shell.openPath(saveDir);
    }
  };

  const handleDownload = (format: VideoFormat): void => {
    try {
      if (!info) return;
      
      const extName = format.hasVideo
        ? format.container
        : format.container === "mp4"
        ? "m4a"
        : format.container === "webm"
        ? "webm"
        : "unknown";
      
      const filename = `${path.join(
        saveDir,
        info.videoDetails.title.replace(/[\"\*\:\<\>\?\/\\\|]/g, "_") // filename safe encoding
      )}-itag${format.itag}.${extName}`;
      
      const writer = fs.createWriteStream(filename);
      const res = ytdl(info.videoDetails.video_url, { quality: format.itag });
      
      res.pipe(writer);
      
      // Initialize progress for this format
      setDownloadProgress(prev => ({
        ...prev,
        [format.itag]: 0
      }));
      
      res.on('progress', (_chunkSize: any, received: number, total: number) => {
        const progress = ((100 * received) / total).toFixed(1);
        setDownloadProgress(prev => ({
          ...prev,
          [format.itag]: progress
        }));
      });
    } catch (err: any) {
      console.error(err);
      setDownloadProgress(prev => ({
        ...prev,
        [format.itag]: `Error: ${err.message}`
      }));
    }
  };

  // Filter formats based on checkbox selections
  const filteredFormats = info?.formats?.filter(
    format => 
      (format.hasAudio || !requireAudio) && 
      (format.hasVideo || !requireVideo)
  ) || [];

  return (
    <div>
      <h1>YTDL</h1>
      
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
        <span>Save location: </span>
        <a onClick={handleOpenSaveDir}>{saveDir || '/'}</a>
        <button onClick={handleChangeSaveDir}>Change</button>
      </div>
      
      <div className="options-row">
        <input 
          type="checkbox" 
          id="require-video" 
          checked={requireVideo} 
          onChange={(e) => setRequireVideo(e.target.checked)} 
        />
        <label htmlFor="require-video"> Video</label>
        &nbsp;&nbsp;&nbsp;
        <input 
          type="checkbox" 
          id="require-audio" 
          checked={requireAudio} 
          onChange={(e) => setRequireAudio(e.target.checked)} 
        />
        <label htmlFor="require-audio"> Audio</label>
      </div>
      
      <div id="info">
        {isLoading && <h3>Analyzing...</h3>}
        
        {info && !isLoading && (
          <>
            <h3>{info.videoDetails.title}</h3>
            <table>
              <thead>
                <tr>
                  <th>Format</th>
                  <th>Audio</th>
                  <th>Video</th>
                  <th>Width</th>
                  <th>Height</th>
                  <th>FPS</th>
                  <th>Bitrate</th>
                  <th>AudioBitrate</th>
                  <th>Size</th>
                  <th>Download</th>
                </tr>
              </thead>
              <tbody>
                {filteredFormats.map((format) => (
                  <tr key={format.itag}>
                    <td>{format.container}</td>
                    <td>{format.hasAudio ? "√" : ""}</td>
                    <td>{format.hasVideo ? "√" : ""}</td>
                    <td>{format.width || ""}</td>
                    <td>{format.height || ""}</td>
                    <td>{format.fps || ""}</td>
                    <td>{format.bitrate || ""}</td>
                    <td>{format.audioBitrate || ""}</td>
                    <td>{displaySize(parseInt(format.contentLength || '0'))}</td>
                    <td>
                      {downloadProgress[format.itag] ? (
                        <span>{downloadProgress[format.itag]}%</span>
                      ) : (
                        <button onClick={() => handleDownload(format)}>
                          Download
                        </button>
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
