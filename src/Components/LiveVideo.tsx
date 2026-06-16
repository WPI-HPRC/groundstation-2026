import "./LiveVideo.css"
import testImg from "../Resources/bg-img-test.png";

export default function LiveVideo() {
    return (
        <div className="live-video-container secondary-container">
            <img className="img-fill" src={testImg}></img>
        </div>
    )
}