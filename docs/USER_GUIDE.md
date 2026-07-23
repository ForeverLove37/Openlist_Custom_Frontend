# OpenList Drive User Guide

OpenList Drive is a browser-based file manager for viewing and downloading files stored in OpenList. Open the application at:

**https://test.erailab.com**

## Sign in

1. Select **Sign in** at the bottom of the left sidebar. On a phone, select the account icon in the top-right corner.
2. Enter your OpenList username and password.
3. Select **Sign in**.
4. If two-factor authentication is enabled, enter the verification code from your authenticator application and submit the form again.

After a successful sign-in, your username appears in the sidebar. To end the session, select the sign-out icon beside your username. On a phone, select the account icon again.

If guest access is enabled by the OpenList administrator, public files can be browsed without signing in.

## Browse files and folders

- Select a folder to open it.
- Use the breadcrumb path at the top of the page to return to any parent folder.
- Select **My files** in the sidebar to return to the root folder.
- Use your browser's Back and Forward buttons to move through previously visited folders.
- Direct links to folders can be bookmarked or shared. Access still depends on the recipient's OpenList permissions.

Each file displays an icon based on its type. Images use lightweight thumbnails in grid view, so folders containing many large images remain responsive.

## Change the layout

Use the layout control above the files:

- **Grid view** displays visual file cards and image thumbnails.
- **List view** displays a compact table with file names, modification dates, and sizes.

The selected layout is remembered in the current browser.

## Search and sort

Enter text in the search field to filter the current folder by file or folder name. Search only examines items in the open folder; it does not search subfolders.

Use the sort menu to order items by:

- Name
- Modified date
- File size

Select the arrow beside the sort menu to switch between ascending and descending order. Folders remain grouped before files.

Use the refresh button to request the latest contents from OpenList.

## View images

Select an image to open the full-screen gallery. The original-resolution file is requested only when it becomes the active image.

Gallery controls include:

- Left and right arrows: view the previous or next image in the folder.
- Zoom in and zoom out: change magnification.
- Reset: restore the original zoom and position.
- Download: download the current image.
- Close: return to the folder.

You can also:

- Press the Left or Right Arrow key to move between images.
- Press `+` or `-` to zoom.
- Press Escape to close the gallery.
- Use the mouse wheel to zoom.
- Drag a zoomed image to pan around it.

On touch devices, use the on-screen controls and drag a zoomed image to pan.

## Play videos

Select a video to open the full-screen player. The application requests a fresh media link from OpenList whenever the video is opened.

The player supports:

- Play and pause
- Timeline seeking
- Volume control
- Playback speed
- Picture-in-picture, when supported by the browser
- Browser fullscreen and web fullscreen

Press Escape or select the close button above the player to return to the folder. Playback support depends on whether the browser supports the video's container and codec; the application does not transcode video files.

## Open or download other files

- Select a non-media file to open it through the browser or its associated application.
- Select the download icon on a file card or list row to download it directly.

OpenList creates a fresh download link when you perform either action. Large files may take a moment to begin downloading, depending on the connected storage provider.

## Unlock a protected folder

If a folder is password protected, the application displays a password prompt:

1. Enter the folder password.
2. Select **Unlock folder**.

Folder passwords are retained only while the page remains open. Refreshing the browser or opening a new tab may require the password again.

An OpenList account and a folder password serve different purposes. Signing in does not automatically bypass a folder password unless the account has permission to do so.

## Use the app on a phone

- Select the menu icon in the top-left corner to open navigation.
- Select the account icon in the top-right corner to sign in or out.
- Search, sorting, layout, gallery, video, and download controls remain available on mobile screens.
- List view can be scrolled horizontally when file details do not fit on screen.

## Troubleshooting

### Sign in required

Your session may be missing or expired. Sign in again with your OpenList account.

### This folder is protected

Enter the folder password. If it is rejected, confirm the password with the person who manages the folder.

### A folder does not show recent changes

Select the refresh button. If the contents still do not update, reload the browser page.

### An image, video, or download does not open

The storage link may have expired or the connected provider may be temporarily unavailable. Close the preview and open the file again to request a fresh link.

For videos, also confirm that your browser supports the file format and codec. Trying a current version of Chrome, Edge, Firefox, or Safari may resolve format-specific playback problems.

### Could not reach the OpenList server

Check your internet connection and reload the application. If the rest of the site loads but file requests continue to fail, contact the OpenList administrator.

### Access is denied after signing in

Your account may not have permission to open that path. Contact the OpenList administrator to request access.

## Browser storage and privacy

The application stores the following information in the browser:

- Your OpenList authentication token
- Your grid or list layout preference

Folder passwords are kept only in the current page's memory. The application does not permanently store them in browser storage.

On a shared computer, sign out when finished and avoid allowing the browser to save credentials you do not want other users to access.
