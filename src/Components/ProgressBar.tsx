import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";

import "./ProgressBar.css"

type ProgressBarProps = {
    title: string,
    secondary: string,
    ticknames: Array<string>
    tickvalues: Array<number>

    color?: string;
    trackColor?: string;
    outlineColor?: string
    textColor?: string;

    thickness?: string;
};

function ProgressBar({
    title,
    secondary = "", 
    ticknames,
    tickvalues,
    color = "var(--accent-color)",
    trackColor = "var(--bg-color-secondary)",
    outlineColor = "none",
    textColor = "var(--fg-color)",
    thickness = "10%",
}: ProgressBarProps) {

    return (
        <div className="ProgressBar" style={
                {
                    "--color": color,
                    "--track-color": trackColor,
                    "--text-color": textColor,
                    '--outline-color': outlineColor,
                    "--bar-width": thickness,
                } as React.CSSProperties
            }>
                <div>
            <p id="progress-bar-title">{title}</p>
            <p id="progress-bar-secondary">{secondary}</p>
            </div>
            <div className="progress-container">
                <div className="progress-bar-outline">
                    <div className="progress-bar-fill"></div>
                </div>
                <div className="progress-ticks-container">
                    {ticknames.map((tickname, index) => (
                        // Always include a unique 'key' prop for list items
                        <p id={`tick-${index}`} style={{position: 'absolute', bottom: `${tickvalues[index] * 100}%`}}>{tickname}</p>
                    ))}
                </div>
            </div>
        </div>
    )
}

export default ProgressBar;