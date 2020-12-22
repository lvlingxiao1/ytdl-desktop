const { app, BrowserWindow, Menu, dialog, ipcMain } = require("electron");
const fs = require("fs");
const path = require("path");

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require("electron-squirrel-startup")) {
	// eslint-disable-line global-require
	app.quit();
}

let options;

const createWindow = () => {
	const configLocation = app.getPath("userData");
	const configFile = path.join(configLocation, "config.json");
	try {
		options = JSON.parse(fs.readFileSync(configFile, "utf8"));
	} catch (e) {
		options = { width: 880, height: 845 };
	}

	if (!options.saveDir) options.saveDir = app.getPath("desktop");

	// Create the browser window.
	const mainWindow = new BrowserWindow({
		width: options.width,
		height: options.height,
		x: options.x,
		y: options.y,
		webPreferences: { nodeIntegration: true, contextIsolation: false },
	});

	// and load the index.html of the app.
	mainWindow.loadFile(path.join(__dirname, "index.html"));

	// Open the DevTools.
	// mainWindow.webContents.openDevTools();

	Menu.setApplicationMenu(null); // Note: comment out this line to use dev tools when developing

	mainWindow.on("close", () => {
		const bounds = mainWindow.getBounds();
		options.x = bounds.x;
		options.y = bounds.y;
		fs.mkdirSync(configLocation, { recursive: true });
		fs.writeFileSync(configFile, JSON.stringify(options));
	});
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on("ready", createWindow);

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on("window-all-closed", () => {
	if (process.platform !== "darwin") {
		app.quit();
	}
});

app.on("activate", () => {
	// On OS X it's common to re-create a window in the app when the
	// dock icon is clicked and there are no other windows open.
	if (BrowserWindow.getAllWindows().length === 0) {
		createWindow();
	}
});

ipcMain.on("load-save-dir", (e) => {
	e.reply("save-dir", options.saveDir);
});

ipcMain.on("set-save-dir", (e) => {
	dialog
		.showOpenDialog({
			title: "Where do you want to save your downloads?",
			defaultPath: options.saveDir,
			properties: ["openDirectory"],
		})
		.then((result) => {
			if (result.canceled) return;
			e.reply("save-dir", result.filePaths[0]);
			options.saveDir = result.filePaths[0];
		})
		.catch((err) => {
			console.error(err);
		});
});
