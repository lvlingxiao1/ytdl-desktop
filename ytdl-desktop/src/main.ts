import { invoke } from "@tauri-apps/api/core";

let greetInputEl: HTMLInputElement | null;
let greetMsgEl: HTMLElement | null;

async function greet() {
  if (greetMsgEl && greetInputEl) {
    // Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
    greetMsgEl.textContent = await invoke("greet", {
      name: greetInputEl.value,
    });
  }
}

window.addEventListener("DOMContentLoaded", () => {
  greetInputEl = document.querySelector("#greet-input");
  greetMsgEl = document.querySelector("#greet-msg");
  document.querySelector("#greet-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    greet();
  });
});

import { html, render } from "lit-html";

import ytdl from 'ytdl-core';
import { createWriteStream } from '@tauri-apps/plugin-fs'


const $ = document.querySelector.bind(document);
let saveDir = "";
let require_video, require_audio, infoTable, info;

/**
 * Display human readable sizes
 * @param {Number} size
 */
function displaySize(size) {
  if (isNaN(size)) return "";
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

/**
 * Download a selected format
 * @param {Object} target 	an entry in data.formats
 */
const download = (target) => {
  try {
    const extName = target.hasVideo
      ? target.container
      : target.container === "mp4"
      ? "m4a"
      : target.container === "webm"
      ? "webm"
      : "unknown";
    const filename = `${path.join(
      saveDir,
      info.videoDetails.title.replace(/[\"\*\:\<\>\?\/\\\|]/g, "_") // filename save encoding
    )}-itag${target.itag}.${extName}`;
    const writer = fs.createWriteStream(filename);
    const resultDiv = $(`#download-${target.itag}`);
    render("0%", resultDiv);
    const res = ytdl(info.videoDetails.video_url, { quality: target.itag });
    res.pipe(writer);
    res.on("progress", (chunkSize, received, total) => {
      render(`${((100 * received) / total).toFixed(1)}%`, resultDiv);
    });
  } catch (err) {
    render(`${err}`, resultDiv);
  }
};

const renderInfoTable = () => {
  if (!info) return;

  render(
    html`<h3>${info.videoDetails.title}</h3>
      <table>
        <tbody>
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
          ${info.formats
            .filter(
              (i) =>
                (i.hasAudio || !require_audio.checked) &&
                (i.hasVideo || !require_video.checked)
            )
            .map(
              (i) => html`<tr>
                <td>${i.container}</td>
                <td>${i.hasAudio ? "√" : ""}</td>
                <td>${i.hasVideo ? "√" : ""}</td>
                <td>${i.width ? i.width : ""}</td>
                <td>${i.height ? i.height : ""}</td>
                <td>${i.fps ? i.fps : ""}</td>
                <td>${i.bitrate ? i.bitrate : ""}</td>
                <td>${i.audioBitrate ? i.audioBitrate : ""}</td>
                <td>${displaySize(i.contentLength)}</td>
                <td id="download-${i.itag}">
                  <button @click=${(e) => download(i)}>
                    Download
                  </button>
                </td>
              </tr> `
            )}
        </tbody>
      </table>`,
    infoTable
  );
};

async function getInfo() {
  const url = $("#u").value;
  render(html`<h3>Analyzing...</h3>`, infoTable);
  try {
    info = await ytdl.getInfo(url);
    renderInfoTable();
  } catch (err) {
    console.error(err);
    render(html`<pre>${err}</pre>`, infoTable);
  }
}

ipcRenderer.on("save-dir", (e, arg) => {
  $("#save-dir").innerText = arg;
  saveDir = arg;
});

window.onload = () => {
  $("#query").addEventListener("click", getInfo);
  ipcRenderer.send("load-save-dir");
  $("#save-dir").addEventListener("click", () => {
    shell.openPath(saveDir);
  });
  $("#change-save-dir").addEventListener("click", () => {
    ipcRenderer.send("set-save-dir");
  });
  require_audio = $("#require-audio");
  require_video = $("#require-video");
  infoTable = $("#info");

  require_audio.addEventListener("change", (e) => renderInfoTable());
  require_video.addEventListener("change", (e) => renderInfoTable());
};
