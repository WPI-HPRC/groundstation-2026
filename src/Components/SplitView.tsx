import view1 from "../Resources/image.png";
import view2 from "../Resources/bg-img-test.png";

import("./SplitView.css");

export default function SplitView() {
    return (
        <div className="split-view-container">
            <div className="split-view-images-container">
                <img src={view1} className="split-view-image" id="live-video-img"></img>
                <img src={view2} className="split-view-image" id="ground-tracking-img"></img>
            </div>
        </div>
    )
}