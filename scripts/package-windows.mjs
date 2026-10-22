import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

const rootDir = process.cwd();
const releaseDir = path.join(rootDir, 'dist-release');
const portableDir = path.join(releaseDir, 'VirtualOffice-Portable');

console.log('[package:win] Preparing Windows portable distribution & Setup executable...');

// 1. Clean & create portable directory structure
fs.rmSync(releaseDir, { recursive: true, force: true });
fs.mkdirSync(path.join(portableDir, 'runtime'), { recursive: true });
fs.mkdirSync(path.join(portableDir, 'dist', 'client'), { recursive: true });
fs.mkdirSync(path.join(portableDir, 'dist', 'server'), { recursive: true });
fs.mkdirSync(path.join(portableDir, 'scripts'), { recursive: true });

// 2. Copy production frontend & backend assets
fs.cpSync(
  path.join(rootDir, 'dist', 'client'),
  path.join(portableDir, 'dist', 'client'),
  { recursive: true }
);
fs.cpSync(
  path.join(rootDir, 'dist', 'server'),
  path.join(portableDir, 'dist', 'server'),
  { recursive: true }
);

// 3. Copy launcher scripts, icons & READMEs
const appIco = path.join(rootDir, 'app.ico');
if (fs.existsSync(appIco)) {
  fs.copyFileSync(appIco, path.join(portableDir, 'app.ico'));
}
fs.copyFileSync(
  path.join(rootDir, 'start-virtual-office.bat'),
  path.join(portableDir, 'start-virtual-office.bat')
);
fs.copyFileSync(
  path.join(rootDir, 'scripts', 'launcher.ps1'),
  path.join(portableDir, 'scripts', 'launcher.ps1')
);
fs.copyFileSync(
  path.join(rootDir, 'scripts', 'create-desktop-shortcut.ps1'),
  path.join(portableDir, 'scripts', 'create-desktop-shortcut.ps1')
);
if (fs.existsSync(path.join(rootDir, 'PROJECT_CONTEXT.md'))) {
  fs.copyFileSync(
    path.join(rootDir, 'PROJECT_CONTEXT.md'),
    path.join(portableDir, 'PROJECT_CONTEXT.md')
  );
}
if (fs.existsSync(path.join(rootDir, 'README.md'))) {
  fs.copyFileSync(
    path.join(rootDir, 'README.md'),
    path.join(portableDir, 'README.md')
  );
}
if (fs.existsSync(path.join(rootDir, 'README_VN.md'))) {
  fs.copyFileSync(
    path.join(rootDir, 'README_VN.md'),
    path.join(portableDir, 'README_VN.md')
  );
}

// 4. Create Uninstall script inside portable/installed folder
const uninstallBat = `@echo off
setlocal
set "INST_DIR=%~dp0"
echo [Virtual Office] Dang go cai dat cac file ung dung tai "%INST_DIR%"...
echo (Luu y: Cac thu muc du an va lich su hoi thoai trong %%LOCALAPPDATA%%\\VirtualOffice van duoc giu nguyen.)
del /f /q "%USERPROFILE%\\Desktop\\The Virtual Office for Your Work.lnk" 2>nul
echo Da go shortcut ngoai Desktop. Ban co the xoa thu muc "%INST_DIR%" neu muon.
pause
`;
fs.writeFileSync(
  path.join(portableDir, 'Uninstall-VirtualOffice.bat'),
  uninstallBat,
  'utf-8'
);

// 5. Bundle standalone Windows 64-bit Node.js runtime (`runtime/node.exe`)
const currentNodeExe = process.execPath;
if (fs.existsSync(currentNodeExe)) {
  console.log(`[package:win] Bundling standalone Node.js runtime from ${currentNodeExe}...`);
  fs.copyFileSync(currentNodeExe, path.join(portableDir, 'runtime', 'node.exe'));
}

// 6. Create Desktop Shortcut in root workspace
const workspaceShortcut = path.join(
  rootDir,
  'The Virtual Office for Your Work.lnk'
);
execFileSync(
  'powershell.exe',
  [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    path.join(rootDir, 'scripts', 'create-desktop-shortcut.ps1'),
    '-TargetInstallDir',
    rootDir,
    '-ShortcutPath',
    workspaceShortcut,
  ],
  { stdio: 'inherit' }
);

try {
  execFileSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      path.join(rootDir, 'scripts', 'create-desktop-shortcut.ps1'),
      '-TargetInstallDir',
      rootDir,
    ],
    { stdio: 'inherit' }
  );
} catch {
  // Ignore if Desktop folder is restricted
}

// 7. Create fully self-contained payload zip (including runtime/node.exe so installer needs NO external dependencies)
console.log('[package:win] Compressing self-contained payload archive for setup installer...');
const appPayloadZip = path.join(releaseDir, 'app-payload.zip');
const payloadStaging = path.join(releaseDir, '_payload_staging');
fs.mkdirSync(payloadStaging, { recursive: true });

fs.cpSync(path.join(portableDir, 'runtime'), path.join(payloadStaging, 'runtime'), {
  recursive: true,
});
fs.cpSync(path.join(portableDir, 'dist'), path.join(payloadStaging, 'dist'), {
  recursive: true,
});
fs.cpSync(path.join(portableDir, 'scripts'), path.join(payloadStaging, 'scripts'), {
  recursive: true,
});
fs.copyFileSync(
  path.join(portableDir, 'start-virtual-office.bat'),
  path.join(payloadStaging, 'start-virtual-office.bat')
);
if (fs.existsSync(path.join(portableDir, 'app.ico'))) {
  fs.copyFileSync(
    path.join(portableDir, 'app.ico'),
    path.join(payloadStaging, 'app.ico')
  );
}
fs.copyFileSync(
  path.join(portableDir, 'Uninstall-VirtualOffice.bat'),
  path.join(payloadStaging, 'Uninstall-VirtualOffice.bat')
);
if (fs.existsSync(path.join(portableDir, 'PROJECT_CONTEXT.md'))) {
  fs.copyFileSync(
    path.join(portableDir, 'PROJECT_CONTEXT.md'),
    path.join(payloadStaging, 'PROJECT_CONTEXT.md')
  );
}
if (fs.existsSync(path.join(portableDir, 'README.md'))) {
  fs.copyFileSync(
    path.join(portableDir, 'README.md'),
    path.join(payloadStaging, 'README.md')
  );
}
if (fs.existsSync(path.join(portableDir, 'README_VN.md'))) {
  fs.copyFileSync(
    path.join(portableDir, 'README_VN.md'),
    path.join(payloadStaging, 'README_VN.md')
  );
}

execFileSync(
  'powershell.exe',
  [
    '-NoProfile',
    '-Command',
    `Compress-Archive -Path "${payloadStaging}\\*" -DestinationPath "${appPayloadZip}" -Force`,
  ],
  { stdio: 'inherit' }
);
fs.rmSync(payloadStaging, { recursive: true, force: true });

// 8. Compile Native Windows Setup Executable (`VirtualOffice-Setup.exe`) using .NET csc.exe
const cscPath = 'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe';
if (fs.existsSync(cscPath)) {
  console.log('[package:win] Compiling self-contained Windows installer VirtualOffice-Setup.exe...');
  const installerCsPath = path.join(releaseDir, 'Installer.cs');
  const setupExeRelease = path.join(releaseDir, 'VirtualOffice-Setup.exe');
  const setupExeRoot = path.join(rootDir, 'VirtualOffice-Setup.exe');

  const csSource = `
using System;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Diagnostics;
using System.Windows.Forms;
using System.Drawing;

[assembly: AssemblyTitle("The Virtual Office for Your Work Setup")]
[assembly: AssemblyProduct("The Virtual Office for Your Work")]
[assembly: AssemblyVersion("1.0.0.0")]

namespace VirtualOfficeSetup {
  public class Program {
    [STAThread]
    public static int Main(string[] args) {
      bool silent = false;
      bool noShortcut = false;
      bool launchAfter = false;
      string targetDir = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "Programs",
        "VirtualOffice"
      );

      foreach (string arg in args) {
        if (arg.Equals("/SILENT", StringComparison.OrdinalIgnoreCase) ||
            arg.Equals("/S", StringComparison.OrdinalIgnoreCase)) {
          silent = true;
        } else if (arg.Equals("/NOSHORTCUT", StringComparison.OrdinalIgnoreCase)) {
          noShortcut = true;
        } else if (arg.Equals("/LAUNCH", StringComparison.OrdinalIgnoreCase)) {
          launchAfter = true;
        } else if (arg.StartsWith("/DIR=", StringComparison.OrdinalIgnoreCase)) {
          targetDir = arg.Substring(5).Trim('"');
        }
      }

      if (silent) {
        return PerformInstall(targetDir, !noShortcut, launchAfter, null, null);
      }

      Application.EnableVisualStyles();
      Application.SetCompatibleTextRenderingDefault(false);

      Form form = new Form();
      try { form.Icon = Icon.ExtractAssociatedIcon(Assembly.GetExecutingAssembly().Location); } catch {}
      form.Text = "The Virtual Office for Your Work - Setup";
      form.Size = new Size(670, 420);
      form.FormBorderStyle = FormBorderStyle.FixedDialog;
      form.MaximizeBox = false;
      form.StartPosition = FormStartPosition.CenterScreen;
      form.BackColor = Color.FromArgb(15, 23, 42); // Slate 900
      form.ForeColor = Color.White;

      bool isEnglish = true;

      // 1. Left Illustration Banner (GDI+ Cozy Pixel Office)
      Panel artPanel = new Panel();
      artPanel.Location = new Point(0, 0);
      artPanel.Size = new Size(195, 420);
      artPanel.BackColor = Color.FromArgb(11, 15, 25);

      artPanel.Paint += (s, pe) => {
        Graphics g = pe.Graphics;
        g.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.NearestNeighbor;
        g.PixelOffsetMode = System.Drawing.Drawing2D.PixelOffsetMode.Half;

        // Background gradient wall
        using (Brush wallBrush = new SolidBrush(Color.FromArgb(15, 23, 42))) {
          g.FillRectangle(wallBrush, 0, 0, 195, 420);
        }

        // Night Window (X: 18, Y: 18, W: 158, H: 100)
        using (Brush winBg = new SolidBrush(Color.FromArgb(2, 6, 23)))
        using (Pen winBorder = new Pen(Color.FromArgb(51, 65, 85), 2)) {
          g.FillRectangle(winBg, 18, 18, 158, 90);
          g.DrawRectangle(winBorder, 18, 18, 158, 90);
          // Window crossbars
          g.DrawLine(winBorder, 18 + 79, 18, 18 + 79, 18 + 90);
          g.DrawLine(winBorder, 18, 18 + 45, 18 + 158, 18 + 45);
        }

        // Stars & Crescent Moon in window
        using (Brush moonBrush = new SolidBrush(Color.FromArgb(254, 240, 138)))
        using (Brush skyCut = new SolidBrush(Color.FromArgb(2, 6, 23)))
        using (Brush starBrush = new SolidBrush(Color.FromArgb(248, 250, 252)))
        using (Brush faintStar = new SolidBrush(Color.FromArgb(148, 163, 184))) {
          // Moon
          g.FillEllipse(moonBrush, 130, 28, 22, 22);
          g.FillEllipse(skyCut, 136, 26, 20, 20);
          // Twinkling stars
          g.FillRectangle(starBrush, 32, 34, 3, 3);
          g.FillRectangle(starBrush, 75, 42, 2, 2);
          g.FillRectangle(starBrush, 48, 68, 2, 2);
          g.FillRectangle(starBrush, 108, 54, 3, 3);
          g.FillRectangle(faintStar, 62, 80, 2, 2);
          g.FillRectangle(faintStar, 120, 82, 2, 2);
        }

        // Ambient Lamp Glow (Warm amber cone)
        using (Brush glowBrush = new SolidBrush(Color.FromArgb(35, 245, 158, 11))) {
          Point[] glowPoly = new Point[] {
            new Point(42, 142),
            new Point(5, 230),
            new Point(95, 230)
          };
          g.FillPolygon(glowBrush, glowPoly);
        }

        // Desk Surface (Y: 220, H: 75)
        using (Brush deskTop = new SolidBrush(Color.FromArgb(180, 83, 9)))
        using (Brush deskFace = new SolidBrush(Color.FromArgb(120, 53, 15)))
        using (Brush deskLegs = new SolidBrush(Color.FromArgb(30, 41, 59))) {
          g.FillRectangle(deskTop, 8, 220, 178, 10);
          g.FillRectangle(deskFace, 8, 230, 178, 22);
          // Legs
          g.FillRectangle(deskLegs, 14, 252, 10, 48);
          g.FillRectangle(deskLegs, 170, 252, 10, 48);
        }

        // Desk Lamp
        using (Brush lampBase = new SolidBrush(Color.FromArgb(71, 85, 105)))
        using (Brush lampArm = new SolidBrush(Color.FromArgb(217, 119, 6)))
        using (Brush lampShade = new SolidBrush(Color.FromArgb(245, 158, 11)))
        using (Brush lampBulb = new SolidBrush(Color.FromArgb(254, 243, 199))) {
          g.FillRectangle(lampBase, 26, 214, 18, 6);
          g.FillRectangle(lampArm, 32, 150, 4, 64);
          g.FillPolygon(lampShade, new Point[] {
            new Point(34, 142),
            new Point(20, 158),
            new Point(52, 158)
          });
          g.FillEllipse(lampBulb, 28, 156, 16, 6);
        }

        // Computer Monitor & Screen (Center)
        using (Brush standBrush = new SolidBrush(Color.FromArgb(71, 85, 105)))
        using (Brush frameBrush = new SolidBrush(Color.FromArgb(30, 41, 59)))
        using (Brush screenBrush = new SolidBrush(Color.FromArgb(15, 23, 42)))
        using (Brush promptCyan = new SolidBrush(Color.FromArgb(56, 189, 248)))
        using (Brush promptGreen = new SolidBrush(Color.FromArgb(52, 211, 153)))
        using (Brush promptAmber = new SolidBrush(Color.FromArgb(251, 191, 36))) {
          // Stand
          g.FillRectangle(standBrush, 98, 205, 14, 15);
          g.FillRectangle(standBrush, 90, 218, 30, 4);
          // Frame
          g.FillRectangle(frameBrush, 72, 145, 68, 60);
          // Screen
          g.FillRectangle(screenBrush, 76, 149, 60, 52);
          // Code prompt lines on screen
          g.FillRectangle(promptGreen, 80, 154, 14, 3);
          g.FillRectangle(promptCyan, 98, 154, 26, 3);
          g.FillRectangle(promptCyan, 80, 161, 36, 3);
          g.FillRectangle(promptAmber, 80, 168, 22, 3);
          g.FillRectangle(promptGreen, 106, 168, 18, 3);
          g.FillRectangle(promptCyan, 80, 175, 42, 3);
          // Blinking cursor
          g.FillRectangle(promptGreen, 80, 184, 6, 6);
        }

        // Cute AI Bot Assistant (Sitting on the right side of desk)
        using (Brush botBody = new SolidBrush(Color.FromArgb(37, 99, 235)))
        using (Brush botVisor = new SolidBrush(Color.FromArgb(6, 182, 212)))
        using (Brush botAntenna = new SolidBrush(Color.FromArgb(245, 158, 11)))
        using (Brush botEye = new SolidBrush(Color.FromArgb(255, 255, 255))) {
          // Antenna
          g.FillRectangle(botAntenna, 157, 160, 2, 8);
          g.FillEllipse(botAntenna, 155, 156, 6, 6);
          // Head
          g.FillRectangle(botBody, 146, 168, 24, 20);
          // Visor Screen
          g.FillRectangle(botVisor, 150, 172, 16, 11);
          // Pixel Eyes (^ _ ^)
          g.FillRectangle(botEye, 152, 175, 3, 3);
          g.FillRectangle(botEye, 160, 175, 3, 3);
          // Body & Hands
          g.FillRectangle(botBody, 149, 188, 18, 22);
          g.FillRectangle(botAntenna, 144, 196, 6, 5); // left hand
          g.FillRectangle(botAntenna, 166, 196, 6, 5); // right hand
        }

        // Steaming Coffee Cup on Desk
        using (Brush cupBrush = new SolidBrush(Color.FromArgb(239, 68, 68)))
        using (Brush coffeeBrush = new SolidBrush(Color.FromArgb(120, 53, 15)))
        using (Pen steamPen = new Pen(Color.FromArgb(203, 213, 225), 1.5f)) {
          g.FillRectangle(cupBrush, 58, 210, 10, 10);
          g.FillRectangle(coffeeBrush, 59, 210, 8, 2);
          // Steam wisps
          g.DrawLine(steamPen, 61, 206, 60, 202);
          g.DrawLine(steamPen, 65, 205, 66, 200);
        }

        // Potted Succulent Plant on Desk
        using (Brush potBrush = new SolidBrush(Color.FromArgb(180, 83, 9)))
        using (Brush plantBrush = new SolidBrush(Color.FromArgb(34, 197, 94))) {
          g.FillPolygon(potBrush, new Point[] {
            new Point(14, 214),
            new Point(22, 214),
            new Point(20, 220),
            new Point(16, 220)
          });
          g.FillEllipse(plantBrush, 13, 206, 10, 9);
        }

        // Cozy Floor & Rug (Y: 298 to 420)
        using (Brush floorBrush = new SolidBrush(Color.FromArgb(30, 41, 59)))
        using (Brush rugBrush = new SolidBrush(Color.FromArgb(79, 70, 229)))
        using (Brush rugPattern = new SolidBrush(Color.FromArgb(99, 102, 241))) {
          g.FillRectangle(floorBrush, 0, 298, 195, 122);
          // Cozy retro rug
          g.FillRectangle(rugBrush, 15, 310, 165, 35);
          g.FillRectangle(rugPattern, 22, 316, 151, 23);
        }

        // Pixel-Art Badge at bottom
        using (Brush badgeBg = new SolidBrush(Color.FromArgb(2, 6, 23)))
        using (Pen badgeBorder = new Pen(Color.FromArgb(56, 189, 248), 1))
        using (Font badgeFont = new Font("Segoe UI", 7.5f, FontStyle.Bold))
        using (Brush textBrush = new SolidBrush(Color.FromArgb(56, 189, 248))) {
          g.FillRectangle(badgeBg, 16, 356, 163, 24);
          g.DrawRectangle(badgeBorder, 16, 356, 163, 24);
          StringFormat sf = new StringFormat();
          sf.Alignment = StringAlignment.Center;
          sf.LineAlignment = StringAlignment.Center;
          g.DrawString("★ PIXEL VIRTUAL OFFICE ★", badgeFont, textBrush, new RectangleF(16, 356, 163, 24), sf);
        }
      };
      form.Controls.Add(artPanel);

      // 2. Right Content Panel
      Panel contentPanel = new Panel();
      contentPanel.Location = new Point(195, 0);
      contentPanel.Size = new Size(475, 420);
      contentPanel.BackColor = Color.FromArgb(15, 23, 42);

      Label title = new Label();
      title.Text = "The Virtual Office for Your Work";
      title.Font = new Font("Segoe UI", 12.5f, FontStyle.Bold);
      title.ForeColor = Color.FromArgb(248, 250, 252);
      title.AutoSize = true;
      title.Location = new Point(20, 16);
      contentPanel.Controls.Add(title);

      Label desc = new Label();
      desc.Text = "AI Coding Terminal & Cozy Pixel-Art Virtual Office for Windows.";
      desc.Font = new Font("Segoe UI", 8.8f);
      desc.ForeColor = Color.FromArgb(148, 163, 184);
      desc.AutoSize = true;
      desc.Location = new Point(20, 44);
      contentPanel.Controls.Add(desc);

      // Language Switcher Button (Top-Right)
      Button langBtn = new Button();
      langBtn.Text = "🌐 VI / EN";
      langBtn.Font = new Font("Segoe UI", 8.5f, FontStyle.Bold);
      langBtn.Size = new Size(86, 26);
      langBtn.Location = new Point(365, 16);
      langBtn.BackColor = Color.FromArgb(30, 41, 59);
      langBtn.ForeColor = Color.FromArgb(226, 232, 240);
      langBtn.FlatStyle = FlatStyle.Flat;
      contentPanel.Controls.Add(langBtn);

      Label dirLabel = new Label();
      dirLabel.Text = "Destination Folder / Drive:";
      dirLabel.Font = new Font("Segoe UI", 9, FontStyle.Bold);
      dirLabel.ForeColor = Color.FromArgb(226, 232, 240);
      dirLabel.AutoSize = true;
      dirLabel.Location = new Point(20, 82);
      contentPanel.Controls.Add(dirLabel);

      TextBox dirBox = new TextBox();
      dirBox.Text = targetDir;
      dirBox.Size = new Size(330, 24);
      dirBox.Location = new Point(20, 105);
      dirBox.Font = new Font("Segoe UI", 9);
      contentPanel.Controls.Add(dirBox);

      Label diskSpaceLabel = new Label();
      diskSpaceLabel.Font = new Font("Segoe UI", 8.5f);
      diskSpaceLabel.ForeColor = Color.FromArgb(56, 189, 248);
      diskSpaceLabel.AutoSize = true;
      diskSpaceLabel.Location = new Point(20, 134);
      contentPanel.Controls.Add(diskSpaceLabel);

      Action updateDiskSpace = () => {
        try {
          string root = Path.GetPathRoot(dirBox.Text);
          if (!string.IsNullOrEmpty(root) && Directory.Exists(root)) {
            DriveInfo di = new DriveInfo(root);
            long freeGb = di.AvailableFreeSpace / (1024 * 1024 * 1024);
            if (isEnglish) {
              diskSpaceLabel.Text = "Drive " + di.Name + " — Free Disk Space: " + freeGb + " GB";
            } else {
              diskSpaceLabel.Text = "O dia " + di.Name + " — Dung luong con trong: " + freeGb + " GB";
            }
          } else {
            diskSpaceLabel.Text = "";
          }
        } catch {
          diskSpaceLabel.Text = "";
        }
      };
      updateDiskSpace();
      dirBox.TextChanged += (s, e) => updateDiskSpace();

      Button browseBtn = new Button();
      browseBtn.Text = "Browse...";
      browseBtn.Font = new Font("Segoe UI", 9, FontStyle.Bold);
      browseBtn.Size = new Size(92, 26);
      browseBtn.Location = new Point(360, 104);
      browseBtn.BackColor = Color.FromArgb(245, 158, 11);
      browseBtn.ForeColor = Color.Black;
      browseBtn.FlatStyle = FlatStyle.Flat;
      browseBtn.Click += (s, e) => {
        using (FolderBrowserDialog fbd = new FolderBrowserDialog()) {
          fbd.Description = isEnglish
            ? "Select an installation drive (C:, D:, E:...) or destination directory:"
            : "Chon o dia (C:, D:, E:...) hoac thu muc cai dat ung dung:";
          fbd.ShowNewFolderButton = true;
          if (Directory.Exists(dirBox.Text)) {
            fbd.SelectedPath = dirBox.Text;
          }
          if (fbd.ShowDialog() == DialogResult.OK) {
            dirBox.Text = fbd.SelectedPath;
          }
        }
      };
      contentPanel.Controls.Add(browseBtn);

      CheckBox chkShortcut = new CheckBox();
      chkShortcut.Text = "Create Desktop Shortcut";
      chkShortcut.Checked = true;
      chkShortcut.AutoSize = true;
      chkShortcut.Location = new Point(20, 164);
      contentPanel.Controls.Add(chkShortcut);

      CheckBox chkLaunch = new CheckBox();
      chkLaunch.Text = "Launch The Virtual Office after installation";
      chkLaunch.Checked = true;
      chkLaunch.AutoSize = true;
      chkLaunch.Location = new Point(20, 192);
      contentPanel.Controls.Add(chkLaunch);

      ProgressBar progress = new ProgressBar();
      progress.Size = new Size(432, 12);
      progress.Location = new Point(20, 226);
      progress.Visible = false;
      contentPanel.Controls.Add(progress);

      Label statusLabel = new Label();
      statusLabel.Font = new Font("Segoe UI", 8.5f);
      statusLabel.ForeColor = Color.FromArgb(148, 163, 184);
      statusLabel.AutoSize = true;
      statusLabel.Location = new Point(20, 244);
      statusLabel.Text = "";
      contentPanel.Controls.Add(statusLabel);

      Button cancelBtn = new Button();
      cancelBtn.Text = "Cancel";
      cancelBtn.Font = new Font("Segoe UI", 9);
      cancelBtn.Size = new Size(80, 36);
      cancelBtn.Location = new Point(372, 276);
      cancelBtn.BackColor = Color.FromArgb(51, 65, 85);
      cancelBtn.ForeColor = Color.White;
      cancelBtn.FlatStyle = FlatStyle.Flat;
      cancelBtn.Click += (s, e) => form.Close();
      contentPanel.Controls.Add(cancelBtn);

      Button installBtn = new Button();
      installBtn.Text = "Install Now";
      installBtn.Font = new Font("Segoe UI", 9.5f, FontStyle.Bold);
      installBtn.Size = new Size(160, 36);
      installBtn.Location = new Point(202, 276);
      installBtn.BackColor = Color.FromArgb(56, 189, 248);
      installBtn.ForeColor = Color.Black;
      installBtn.FlatStyle = FlatStyle.Flat;

      // Language Switcher Logic
      Action applyLanguage = () => {
        if (isEnglish) {
          form.Text = "The Virtual Office for Your Work - Setup";
          title.Text = "The Virtual Office for Your Work";
          desc.Text = "AI Coding Terminal & Cozy Pixel-Art Virtual Office for Windows.";
          dirLabel.Text = "Destination Folder / Drive:";
          browseBtn.Text = "Browse...";
          chkShortcut.Text = "Create Desktop Shortcut";
          chkLaunch.Text = "Launch The Virtual Office after installation";
          installBtn.Text = "Install Now";
          cancelBtn.Text = "Cancel";
          langBtn.Text = "🌐 VI";
        } else {
          form.Text = "The Virtual Office for Your Work - Bo Cai Dat";
          title.Text = "The Virtual Office for Your Work";
          desc.Text = "Khong gian lap trinh AI Terminal & Van phong Pixel-Art tren Windows.";
          dirLabel.Text = "Chon o dia hoac thu muc cai dat:";
          browseBtn.Text = "Chon thu muc...";
          chkShortcut.Text = "Tao bieu tuong ngoai man hinh Desktop";
          chkLaunch.Text = "Khoi dong The Virtual Office ngay sau khi cai dat";
          installBtn.Text = "Cai Dat Ngay";
          cancelBtn.Text = "Huy bo";
          langBtn.Text = "🌐 EN";
        }
        updateDiskSpace();
      };

      langBtn.Click += (s, e) => {
        isEnglish = !isEnglish;
        applyLanguage();
      };

      installBtn.Click += (s, e) => {
        installBtn.Enabled = false;
        cancelBtn.Enabled = false;
        browseBtn.Enabled = false;
        dirBox.Enabled = false;
        langBtn.Enabled = false;
        progress.Visible = true;
        progress.Style = ProgressBarStyle.Marquee;
        statusLabel.Text = isEnglish
          ? "Extracting and installing application files to destination..."
          : "Dang giai nen va cai dat cac tep tin vao o dia...";

        Application.DoEvents();

        int code = PerformInstall(dirBox.Text, chkShortcut.Checked, chkLaunch.Checked, progress, statusLabel);
        if (code == 0) {
          string successMsg = isEnglish
            ? "Installation completed successfully!\\n\\nDestination: " + dirBox.Text + "\\n\\nYou can launch the application from the Desktop shortcut or start-virtual-office.bat."
            : "Cai dat thanh cong!\\n\\nThu muc cai dat: " + dirBox.Text + "\\n\\nBan co the nhap dup start-virtual-office.bat hoac shortcut ngoai Desktop de bat dau.";
          string successTitle = isEnglish ? "Virtual Office Setup" : "Cai Dat Thanh Cong";

          MessageBox.Show(successMsg, successTitle, MessageBoxButtons.OK, MessageBoxIcon.Information);
          form.Close();
        } else {
          installBtn.Enabled = true;
          cancelBtn.Enabled = true;
          browseBtn.Enabled = true;
          dirBox.Enabled = true;
          langBtn.Enabled = true;
          progress.Visible = false;
        }
      };
      contentPanel.Controls.Add(installBtn);

      form.Controls.Add(contentPanel);

      Application.Run(form);
      return 0;
    }

    private static int PerformInstall(
      string installDir,
      bool createShortcut,
      bool launchAfter,
      ProgressBar progress,
      Label statusLabel
    ) {
      try {
        Directory.CreateDirectory(installDir);
        string tempZip = Path.Combine(Path.GetTempPath(), "vo-setup-" + Guid.NewGuid().ToString("N") + ".zip");
        using (Stream resStream = Assembly.GetExecutingAssembly().GetManifestResourceStream("app-payload.zip")) {
          if (resStream == null) throw new Exception("Embedded application payload not found.");
          using (FileStream fs = new FileStream(tempZip, FileMode.Create, FileAccess.Write)) {
            resStream.CopyTo(fs);
          }
        }

        // Extract files (overwrite existing safely)
        using (ZipArchive archive = ZipFile.OpenRead(tempZip)) {
          foreach (ZipArchiveEntry entry in archive.Entries) {
            string fullPath = Path.GetFullPath(Path.Combine(installDir, entry.FullName));
            if (!fullPath.StartsWith(Path.GetFullPath(installDir), StringComparison.OrdinalIgnoreCase)) {
              continue;
            }
            if (string.IsNullOrEmpty(entry.Name)) {
              Directory.CreateDirectory(fullPath);
            } else {
              Directory.CreateDirectory(Path.GetDirectoryName(fullPath));
              entry.ExtractToFile(fullPath, true);
            }
          }
        }
        File.Delete(tempZip);

        if (createShortcut) {
          string psScript = Path.Combine(installDir, "scripts", "create-desktop-shortcut.ps1");
          if (File.Exists(psScript)) {
            ProcessStartInfo psi = new ProcessStartInfo("powershell.exe",
              "-NoProfile -ExecutionPolicy Bypass -File \\"" + psScript + "\\" -TargetInstallDir \\"" + installDir + "\\"");
            psi.CreateNoWindow = true;
            psi.UseShellExecute = false;
            Process p = Process.Start(psi);
            p.WaitForExit(10000);
          }
        }

        if (launchAfter) {
          string launcherBat = Path.Combine(installDir, "start-virtual-office.bat");
          if (File.Exists(launcherBat)) {
            ProcessStartInfo lpsi = new ProcessStartInfo(launcherBat);
            lpsi.WorkingDirectory = installDir;
            lpsi.UseShellExecute = true;
            Process.Start(lpsi);
          }
        }
        return 0;
      } catch (Exception ex) {
        if (statusLabel != null) {
          statusLabel.Text = "Loi cai dat: " + ex.Message;
        }
        MessageBox.Show("Cai dat that bai: " + ex.Message, "Setup Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
        return 1;
      }
    }
  }
}
`;
  fs.writeFileSync(installerCsPath, csSource, 'utf-8');

  const cscArgs = [
    '/target:winexe',
    `/out:${setupExeRelease}`,
    '/reference:System.IO.Compression.dll',
    '/reference:System.IO.Compression.FileSystem.dll',
    '/reference:System.Windows.Forms.dll',
    '/reference:System.Drawing.dll',
    `/resource:${appPayloadZip},app-payload.zip`,
  ];
  if (fs.existsSync(appIco)) {
    cscArgs.push(`/win32icon:${appIco}`);
  }
  cscArgs.push(installerCsPath);

  execFileSync(cscPath, cscArgs, { stdio: 'inherit' });

  fs.copyFileSync(setupExeRelease, setupExeRoot);
  fs.unlinkSync(installerCsPath);
  fs.unlinkSync(appPayloadZip);
  console.log(`[package:win] Created self-contained installer: ${setupExeRoot}`);
}

console.log('[package:win] Packaging complete!');
