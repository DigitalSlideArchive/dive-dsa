const path = require('path');

const webpack = require('webpack');

const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = function (config) {
    const outPath = config.output.path;
    const updatedPath = config.output.path.replace('static/built/plugins/dive_server', '')
    config.plugins.push(
        new CopyWebpackPlugin([{
            from: path.join(path.resolve(__dirname), 'node_modules', 'dive-dsa', 'dist'),
            to: path.join(updatedPath, 'static', 'dive')
        }, ])
    );
    config.plugins.push(
        new webpack.DefinePlugin({
            BUILD_TIMESTAMP: Date.now()
        })
    );
    return config;
};