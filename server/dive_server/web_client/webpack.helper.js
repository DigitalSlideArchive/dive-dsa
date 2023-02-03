const path = require('path');

const webpack = require('webpack');

const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = function (config) {
    config.plugins.push(
        new CopyWebpackPlugin([{
            from: path.join(path.resolve(__dirname), 'node_modules', 'dive-dsa', 'dist'),
            to: path.join(config.output.path, 'static', 'dive')
        }, ])
    );
    config.plugins.push(
        new webpack.DefinePlugin({
            BUILD_TIMESTAMP: Date.now()
        })
    );
    return config;
};