# The Virtual Office for Your Work — Hướng Dẫn Sử Dụng (Tiếng Việt)

**Ứng Dụng Windows Cục Bộ | Tích Hợp Antigravity CLI (`agy.exe`) | Văn Phòng Pixel-Art Sống Động | Tự Động Quản Lý Vòng Đời Tắt Server**

---

## 1. Giới Thiệu Tổng Quan

**The Virtual Office for Your Work** là ứng dụng web cục bộ dành riêng cho Windows 10 và Windows 11 (64-bit), kết hợp giữa không gian làm việc lập trình AI phong cách terminal với một văn phòng pixel-art ấm cúng:

- **Khung bên trái (khoảng 66.67% màn hình)**: Không gian làm việc AI Terminal, cho phép bạn chọn thư mục dự án trên máy Windows (hỗ trợ đầy đủ tiếng Việt có dấu, khoảng trắng, ký tự ổ đĩa), quản lý lịch sử hội thoại cục bộ, hiển thị khối mã nguồn có nút sao chép 1-chạm (Copy), theo dõi tiến trình thực thi công cụ (Tool calls) và phê duyệt quyền thực thi lệnh an toàn.
- **Khung bên phải (khoảng 33.33% màn hình)**: Văn phòng pixel-art ấm cúng với nhân vật trợ lý AI hoạt họa chuyển động mượt mà qua 7 trạng thái thực tế (`IDLE`, `THINKING`, `WORKING`, `WAITING`, `COMPLETED`, `ERROR`, `DISCONNECTED`), đồng hồ treo tường đồng bộ theo giờ thật của máy tính, cửa sổ nhìn ra bầu trời đêm và thành phố, đèn bàn tỏa ánh sáng ấm, chậu cây Monstera và bảng tin hoạt động (Activity Feed) cập nhật theo thời gian thực.
- **Tùy Chọn Ngôn Ngữ Song Ngữ (VI / EN)**: Bạn có thể chuyển đổi linh hoạt giữa Tiếng Anh và Tiếng Việt bất kỳ lúc nào bằng nút gạt `[🇺🇸 EN / 🇻🇳 VI]` ngay trên thanh công cụ hoặc trong hộp thoại Cài Đặt (Settings). Toàn bộ nhãn, thông báo, nhật ký văn phòng, và bảng thống kê token đều được dịch chuẩn xác.
- **Thanh trạng thái Token & Quota góc dưới bên phải**: Hiển thị thông số mô hình AI, số lượng token tiêu thụ và hạn mức tài khoản lấy trực tiếp từ lệnh `/usage` của Antigravity CLI thực tế.
- **Tự động tắt Server khi đóng hết tab**: Server cục bộ chỉ liên kết với `127.0.0.1` (an toàn tuyệt đối, không mở ra mạng ngoài) và sẽ tự động tắt sau khi bạn đóng toàn bộ các tab trình duyệt của ứng dụng.

---

## 2. Cách Khởi Động Nhanh (1-Click)

### Cách 1: Khởi động trực tiếp (Khuyên Dùng)
- Nhấp đúp vào file **`start-virtual-office.bat`** (hoặc biểu tượng shortcut **`The Virtual Office for Your Work.lnk`** trên màn hình Desktop).
- Ứng dụng sẽ tự động khởi động server cục bộ, kiểm tra trạng thái sẵn sàng và mở giao diện trên trình duyệt mặc định của bạn. Nếu server đã đang chạy, nó sẽ tự mở thêm một tab mới mà không khởi động trùng lặp.

### Cách 2: Bộ cài đặt Windows (`VirtualOffice-Setup.exe`)
- Nhấp đúp vào **`VirtualOffice-Setup.exe`** (ở thư mục gốc hoặc trong `dist-release\VirtualOffice-Setup.exe`).
- **Giao diện sinh động**: Có tranh minh họa GDI+ phong cách pixel-art (cửa sổ ngắm sao, bàn làm việc, màn hình hiển thị code, đèn bàn ấm cúng, robot AI và tách cà phê).
- **Mặc định Tiếng Anh**: Giao diện cài đặt mặc định hoàn toàn bằng Tiếng Anh chuẩn mực, đồng thời có nút bấm `[🌐 VI / EN]` để chuyển sang Tiếng Việt nếu muốn.
- **Hỗ trợ chọn ổ đĩa**: Cho phép bạn duyệt và chọn bất kỳ ổ đĩa nào (`C:`, `D:`, `E:...`) hoặc thư mục tùy ý, tự động tính toán dung lượng trống còn lại của ổ đĩa đã chọn (mặc định là `%LOCALAPPDATA%\Programs\VirtualOffice`), tự động tạo shortcut ngoài Desktop và gỡ cài đặt sạch sẽ khi không dùng nữa mà không bao giờ làm mất file dự án của bạn.
- Hỗ trợ cài đặt tự động không cần bấm giao diện:
  ```powershell
  .\VirtualOffice-Setup.exe /SILENT /DIR="D:\VirtualOffice" /NOSHORTCUT
  ```

### Cách 3: Bản chạy di động không cần cài đặt (`dist-release\VirtualOffice-Portable`)
- Thư mục này đã tích hợp sẵn Node.js 64-bit (`runtime\node.exe`), toàn bộ mã nguồn frontend/backend đã biên dịch và file `start-virtual-office.bat`. Bạn có thể sao chép cả thư mục này sang máy tính Windows khác và chạy ngay mà không cần cài thêm công cụ lập trình nào.

---

## 3. Cơ Chế Kết Nối Antigravity: Nó Có Tự Tìm Không? Khi Dùng Máy Khác Thì Sao?

### Câu hỏi: *Nó có tự động tìm Antigravity để kết nối không?*
**Trả lời: CÓ, hoàn toàn tự động!**

Khi khởi động hoặc kiểm tra trạng thái, hệ thống backend ([agyAdapter.ts](file:///C:/Duzg/Project/src/server/agyAdapter.ts)) tự động dò tìm file thực thi `agy.exe` theo thứ tự ưu tiên sau:

1. **Biến môi trường tùy chỉnh**: Kiểm tra biến `AGY_BIN_PATH` (nếu bạn đặt đường dẫn riêng).
2. **Thư mục cài đặt mặc định của Antigravity CLI**:
   `%LOCALAPPDATA%\agy\bin\agy.exe` (tự động phân giải theo tên tài khoản của bất kỳ máy Windows nào, ví dụ `C:\Users\<Tên_User>\AppData\Local\agy\bin\agy.exe`).
3. **Biến môi trường hệ thống (`PATH`)**: Dò tìm trong tất cả các thư mục có trong `PATH` của Windows để xem `agy.exe` có sẵn không.

---

### Câu hỏi: *Nếu tôi mang sang máy tính khác dùng thì sao?*

Sẽ có **2 trường hợp** xảy ra trên máy tính khác:

#### Trường hợp A: Máy tính đó ĐÃ CÀI đặt và đăng nhập Antigravity CLI
- Ứng dụng sẽ **tự động phát hiện ngay lập tức** `agy.exe` tại thư mục `%LOCALAPPDATA%\agy\bin\` của máy đó.
- Trạng thái kết nối sẽ tự động hiện **CONNECTED: Antigravity CLI** và tải danh sách mô hình thực tế (`gemini-4-argon-medium`, `claude-sonnet-5-5-medium`,...).
- Dữ liệu hạn mức `/usage` và số lượng token sẽ được lấy trực tiếp từ tài khoản Antigravity đã đăng nhập trên máy đó.

#### Trường hợp B: Máy tính đó CHƯA CÀI Antigravity CLI
- Ứng dụng **vẫn khởi động và hoạt động bình thường**, không bị lỗi hay văng ứng dụng.
- Ứng dụng sẽ tự động chuyển sang **Demo Mode (Chế độ mô phỏng)**. Mọi phản hồi, hoạt ảnh văn phòng pixel-art, duyệt thư mục và giao diện terminal vẫn hoạt động đầy đủ để bạn trải nghiệm.
- Mọi nội dung mô phỏng đều được dán nhãn minh bạch `[DEMO MODE — SIMULATED]` (không bao giờ bịa đặt token hay giả mạo kết nối thành công).
- **Khi bạn muốn dùng Antigravity thật trên máy mới**:
  1. Chỉ cần cài đặt Antigravity CLI trên máy đó (hoặc chạy lệnh đăng nhập `agy`).
  2. Bấm nút chuyển đổi **"Real AGY CLI"** trên thanh công cụ của ứng dụng, hệ thống sẽ tự động nhận diện và kết nối ngay lập tức!

---

## 4. Tính Năng Chọn Thư Mục Dự Án (Duyệt Thư Mục)

Bấm vào thanh chọn thư mục ở góc trên bên trái:
- **Nút `Browse...` (Màu vàng/cam)**: Mở ngay hộp thoại đồ họa chuẩn của Windows (`FolderBrowserDialog`) để duyệt ổ đĩa `C:\`, `D:\` và chọn thư mục bằng chuột.
- **Ô nhập đường dẫn trực tiếp**: Cho phép gõ hoặc dán đường dẫn (tự động hỗ trợ tiếng Việt có dấu như `C:\Dự Án Tiếng Việt`, khoảng trắng, tự động loại bỏ dấu ngoặc kép khi bạn dùng tính năng *"Copy as path"* của Windows).
- **Nút `Explore Folder` (Biểu tượng la bàn)**: Duyệt cấu trúc cây thư mục con ở bảng bên dưới đối với đường dẫn bạn vừa nhập.
- **Nút `Select Folder`**: Xác nhận chọn thư mục làm không gian làm việc hiện tại.
- **An toàn tuyệt đối**: Việc chọn thư mục chỉ cấp quyền ngữ cảnh cho AI, **không bao giờ** tự ý chạy script hay lệnh mã độc trong thư mục đó.

---

## 5. Cơ Chế Tự Động Tắt Server Khi Đóng Trình Duyệt (Auto-Shutdown)

- Mỗi tab trình duyệt khi mở ra sẽ có một mã định danh riêng (`tabId`) và gửi tín hiệu nhịp tim định kỳ (**5 giây/lần**) về server.
- Khi đóng tab, trình duyệt sẽ gửi tín hiệu ngắt kết nối nhanh qua `navigator.sendBeacon`.
- **Nếu mở nhiều tab**: Đóng 1 tab trong khi các tab khác còn mở sẽ **không** làm tắt server.
- **Nếu tải lại trang (F5 / Reload)**: Khi tab tải lại và kết nối lại trong thời gian ân hạn 5 giây, lệnh tắt server sẽ tự động được hủy bỏ, đảm bảo trải nghiệm liên tục.
- **Khi đóng tab cuối cùng**: Server bắt đầu đếm ngược thời gian ân hạn (mặc định 5 giây). Nếu không còn tab nào mở, server sẽ tự động tắt hoàn toàn và giải phóng cổng mạng, không để lại tiến trình chạy ngầm.
- **Nếu trình duyệt bị tắt đột ngột (Crash)**: Server sẽ tự động phát hiện các phiên không còn gửi nhịp tim sau 25 giây và tự động tắt an toàn.

---

## 6. Bảng Phân Định Tính Năng Thật vs. Mô Phỏng

| Tính Năng | Trạng Thái | Chi Tiết |
| :--- | :--- | :--- |
| **Gửi prompt & Streaming phản hồi** | **THỰC TẾ** (`agy.exe`) | Chạy qua `agy.exe -p "<prompt>" --output-format stream-json` với luồng dữ liệu thời gian thực. |
| **Đồng bộ hành động trợ lý Pixel-Art** | **THỰC TẾ** (`agy.exe`) | Hoạt ảnh nhân vật thay đổi theo các sự kiện thực tế: suy nghĩ (`THINKING`), gõ mã (`WORKING`), chờ duyệt quyền (`WAITING`), hoàn thành (`COMPLETED`). |
| **Phê duyệt quyền chạy lệnh (Tool Permissions)** | **THỰC TẾ** (`agy.exe`) | Tuân thủ chính sách quyền của Antigravity. Nếu lệnh cần cấp quyền, ứng dụng hiện banner trực quan để bạn bấm **"Authorize & Re-Run Turn"**. |
| **Số liệu Token tiêu thụ** | **THỰC TẾ** (`agy.exe`) | Đọc số token input, output, thinking và tổng token thực tế do `agy.exe` trả về ở mỗi lượt. |
| **Hạn mức tài khoản `/usage`** | **THỰC TẾ** (`agy.exe`) | Lấy trực tiếp từ lệnh `agy -p "/usage" --output-format json` (các nhóm hạn mức Gemini Models, Claude/GPT, Argon, % còn lại và thời gian reset). |
| **Dung lượng Context Window (%)** | **KHÔNG BỊA ĐẶT** | `agy.exe` xuất ra số token đầu vào thực tế nhưng không cung cấp % trần dung lượng tĩnh trong JSON. Thanh trạng thái dán nhãn trung thực là `UNSUPPORTED BY CLI` thay vì bịa số ngẫu nhiên. |
| **Chế độ Demo (Khi không có Antigravity)** | **MÔ PHỎNG MINH BẠCH** | Là module riêng biệt ([demoAdapter.ts](file:///C:/Duzg/Project/src/server/demoAdapter.ts)), luôn dán nhãn `[DEMO MODE — SIMULATED]`. |

---

## 7. Các Lệnh Dành Cho Nhà Phát Triển (Nếu Cần Build Lại)

Nếu bạn muốn chỉnh sửa mã nguồn và build lại:
```powershell
# Biên dịch frontend (dist/client) và backend (dist/server/index.mjs)
npm run build

# Chạy toàn bộ bộ kiểm thử tự động (7 kịch bản kiểm thử)
npm test

# Đóng gói bản di động (dist-release/VirtualOffice-Portable) và bộ cài Setup.exe
npm run package:win
```
