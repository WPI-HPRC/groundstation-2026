use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::Arc;
use std::thread;
use std::time::Duration;

use tokio::sync::Mutex;
use tokio_util::sync::CancellationToken;

use crate::middleware::Middleware;

pub const MJPEG_PORT: u16 = 17777;

const BOUNDARY: &str = "hprcframe";
const FRAME_INTERVAL: Duration = Duration::from_millis(33);

pub fn spawn(middleware: Arc<Mutex<Middleware>>, shutdown: CancellationToken) {
    thread::spawn(move || {
        let listener = match TcpListener::bind(("127.0.0.1", MJPEG_PORT)) {
            Ok(listener) => listener,
            Err(err) => {
                eprintln!("[video_stream] failed to bind 127.0.0.1:{MJPEG_PORT}: {err}");
                return;
            }
        };
        if let Err(err) = listener.set_nonblocking(true) {
            eprintln!("[video_stream] failed to set nonblocking listener: {err}");
            return;
        }
        println!("[video_stream] MJPEG server listening on http://127.0.0.1:{MJPEG_PORT}");

        while !shutdown.is_cancelled() {
            match listener.accept() {
                Ok((stream, _)) => {
                    let middleware = middleware.clone();
                    thread::spawn(move || handle_client(stream, middleware));
                }
                Err(err) if err.kind() == std::io::ErrorKind::WouldBlock => {
                    thread::sleep(Duration::from_millis(25));
                }
                Err(err) => eprintln!("[video_stream] accept failed: {err}"),
            }
        }
    });
}

fn handle_client(mut stream: TcpStream, middleware: Arc<Mutex<Middleware>>) {
    let Some(path) = read_request_path(&mut stream) else {
        let _ = write_not_found(&mut stream);
        return;
    };
    let Some(name) = stream_name_from_path(&path) else {
        let _ = write_not_found(&mut stream);
        return;
    };

    let header = format!(
        "HTTP/1.1 200 OK\r\n\
         Cache-Control: no-store, no-cache, must-revalidate, max-age=0\r\n\
         Pragma: no-cache\r\n\
         Connection: close\r\n\
         Content-Type: multipart/x-mixed-replace; boundary={BOUNDARY}\r\n\r\n"
    );
    if stream.write_all(header.as_bytes()).is_err() {
        return;
    }

    let mut last_ts = None;
    loop {
        let preview_frame = {
            let middleware = middleware.blocking_lock();
            middleware.latest_preview_jpeg(&name)
        };

        match preview_frame {
            Some(frame) if Some(frame.timestamp) != last_ts => {
                last_ts = Some(frame.timestamp);
                if write_jpeg_part(&mut stream, &frame.data).is_err() {
                    return;
                }
            }
            _ => {
                let frame = {
                    let middleware = middleware.blocking_lock();
                    middleware.latest_video_frame(&name)
                };
                if let Some(frame) = frame {
                    if Some(frame.timestamp) != last_ts {
                        last_ts = Some(frame.timestamp);
                        match frame.to_frontend_jpeg(75) {
                            Ok(jpeg) => {
                                if write_jpeg_part(&mut stream, &jpeg).is_err() {
                                    return;
                                }
                            }
                            Err(err) => {
                                eprintln!("[video_stream] failed to encode {name}: {err}");
                            }
                        }
                    }
                }
            }
        }
        thread::sleep(FRAME_INTERVAL);
    }
}

fn write_jpeg_part(stream: &mut TcpStream, jpeg: &[u8]) -> std::io::Result<()> {
    let part_header = format!(
        "--{BOUNDARY}\r\nContent-Type: image/jpeg\r\nContent-Length: {}\r\n\r\n",
        jpeg.len()
    );
    stream.write_all(part_header.as_bytes())?;
    stream.write_all(jpeg)?;
    stream.write_all(b"\r\n")
}

fn read_request_path(stream: &mut TcpStream) -> Option<String> {
    let mut buf = [0u8; 1024];
    let n = stream.read(&mut buf).ok()?;
    let request = String::from_utf8_lossy(&buf[..n]);
    let mut parts = request.lines().next()?.split_whitespace();
    let method = parts.next()?;
    let path = parts.next()?;
    (method == "GET").then(|| path.to_string())
}

fn stream_name_from_path(path: &str) -> Option<String> {
    let name = path.strip_prefix("/video/")?.strip_suffix(".mjpg")?;
    (!name.is_empty() && name.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-'))
        .then(|| name.to_string())
}

fn write_not_found(stream: &mut TcpStream) -> std::io::Result<()> {
    stream.write_all(b"HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\n\r\n")
}
