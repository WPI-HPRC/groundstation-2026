import { LineChart, Line, XAxis, YAxis, Tooltip, Legend } from 'recharts';
import React, { useState, useEffect } from 'react';

interface GraphData {
    x: string
    y: number
};

interface GraphProps {
    data: Array<GraphData>,
    xlabel: string, 
    ylabel: string, 
    title: string
};

function Graph({data, xlabel, ylabel, title}: GraphProps): JSX.Element {

    return (
        <LineChart width={500} height={300} data={data}>
          <XAxis dataKey="x" type="number" label={xlabel} domain={['auto', 'auto']}/>
          <YAxis label={ylabel} domain={['auto', 'auto']}/>
          <Line type="monotone" dataKey="y" stroke="#8884d8" isAnimationActive={false} dot={false} />
          <text 
            x={300} 
            y={20} 
            textAnchor="middle" 
            dominantBaseline="central" 
            style={{ fontSize: '20px', fontWeight: 'bold' }}
            >{title}</text>
        </LineChart>
    );
}

export default Graph;