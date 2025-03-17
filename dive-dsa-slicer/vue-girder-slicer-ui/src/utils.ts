
function extractImageInfo(imageName: string) {
    // Define a regular expression to match Docker image names and tags
    const regex = /^(?:.*\/)?([^:/]+)(?::([^/]+))?$/;
    
    // Use the regular expression to extract the base name and tag
    const match = imageName.match(regex);
    
    if (match) {
      const baseName = match[1]; // Group 1 contains the base name
      const tag = match[2] || 'latest'; // Group 2 contains the tag, default to 'latest' if not present
      
      return { baseName, tag };
    } else {
      // Handle invalid image names here
      return null;
    }
  }

export {
    extractImageInfo,
};