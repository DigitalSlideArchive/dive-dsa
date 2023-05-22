
# Attribute Rendering

Attributes can be displayed within the annotation area next to the tracks they are associated with.
Within the Attribute Editor there is a tab for Rendering and when turned on there are settings which can specify how the attribute is displayed and what tracks it is displayed.


![Attribute Rendering Demo](images/Attributes/AttributeRenderingDemo.png){ align=center width=800px }
In the above demo the Detection attributes are rendered to the side of the track with custom text and colors for displaying each.


## Attribute Rendering Settings

![Attribute Rendering Settings](images/Attributes/AttributeRenderingSettings.png){ align=center}

Under the Rendering Tab for the Attribute Editor if you turn on Render there will be numerous settings which determine how the attribute is displayed.


* **Settings**
    * *Selected Track* - only display attributes for the selected track.
    * *Filter Types* - Will filter and only place the attribute rendering on the filtered track types.
    * *Order* - Order is used to determine the top-to-bottom order of the attributes that are rendered.  A lower number means it has higher priority in the list.
* **Display**
    * *Display Name* - The Name displayed at the top as a label for the attribute.  You can add a : to the display name.  It will automatically populate with the attribute name
    * *Display Text Size* - Text size in pixel for the display name.  This will remain constant when scrolling in/out of the track.
    * *Display Color* - Text color for the display text.  If set to auto it will utilize the attribute color.  If Auto is turned off you can set a custom display text color
* **Value**
    * *Value Text Size* - Text size in pixel for the value.  This will remain constant when scrolling in/out of the track.
    * *Value Color* - Text color for the display text.  If set to auto it will utilize the attribute color.  If Auto is turned off you can set a custom display text color.
* **Dimensions**
    * *% Type* - For width and height it will size the area for the attribute based on the track width/height.
    * *px Type* - It will size the dimension of the width/height in pixels.  This is useful if you have tracks of varying sizes and always want the attributes to fit properly.
    * *auto Type* - Only for the height this will automatically partition the height of the track into even parts based on the number of attributes that are being used.
* **Box**
    * *Draw Box* - Basic setting to draw the box, if not selected the attribute will float there.
    * *Thickness* - Line Thickness for the outside of the box.
    * *Box Color* - Line color for the box.  If set to auto it will utilize the attribute color.
    * *Box Background* - Will draw a background for the box instead of being transparent
    * *Box Background Color* - Background color for the box.  If set to auto it will utilize the attribute color.
    * *Box Background Opacity* - The Opacity of the background color for the box

    
    



    
