/*
Copyright (c) 2003-2012, CKSource - Frederico Knabben. All rights reserved.
For licensing, see LICENSE.html or http://ckeditor.com/license

Copyright (c) 2012, Brian McCloskey. All rights reserved.
For licensing, see LICENSE, or <http://www.gnu.org/licenses/>

This code was modififed from the CKEditor plugin blockquote.
*/
(function()
{
	function getState( editor, path )
	{
		var firstBlock = path.block || path.blockLimit;
		
		if ( !firstBlock || firstBlock.getName() == 'body' )
			return CKEDITOR.TRISTATE_OFF;
		
		// See if the first block h as a code parent.
		if ( firstBlock.getAscendant( 'code', true ) )
			return CKEDITOR.TRISTATE_ON;
		
		return CKEDITOR.TRISTATE_OFF;
	}
	
	function onSelectionChange( evt )
	{
		if ( evt.editor.readOnly )
			return;
		
		var command = evt.editor.getCommand( this.name );
		command.state = getState( evt.editor, evt.data.path );
		command.fire( 'state' );
		command.refresh( evt.data.path );
	}
	
	function getCodeType( element, useComputedState )
	{
		useComputedState = useComputedState === undefined || useComputedState;
		
		var codeType;

		if ( useComputedState )
		{
			var container = element.getParent(),
				curClass = container.$.className,
				preClass = container.$.parentNode.className;
			try {
				if ( curClass == 'codeblock' || preClass == 'codeblock' )
					codeType = 'code';
				else if ( curClass == 'codeblock phpblock' || preClass == 'codeblock phpblock' )
					codeType = 'php';
			}
			catch ( e )
			{
			}
		}
		return codeType;
	}
			
	function noBlockLeft( codeBlock )
	{
		for ( var i = 0, length = codeBlock.getChildCount(), child ; i < length && ( child = codeBlock.getChild( i ) ); i++ )
		{
			if ( child.type == CKEDITOR.NODE_ELEMENT && child.isBlockBoundary() )
				return false;
		}
		return true;
	}
	
	function codeCommand( editor, name, value )
	{
		this.editor = editor;
		this.name = name;
		this.value = value;
		
		switch ( value )
		{
			case 'code' :
				this.cssClassName = 'codeblock';
				break;
			case 'php' :
				this.cssClassName = 'codeblock phpblock';
				break;
		}
	}
	
	codeCommand.prototype = 
	{
		exec : function( editor )
		{
			var state = editor.getCommand( this.name ).state,
				selection = editor.getSelection(),
				range = selection && selection.getRanges( true )[0],
				lang = editor.lang.mybbcode;
			
			if ( !range )
				return;
			
			var bookmarks = selection.createBookmarks(),
				iterator = range.createIterator(),
				block;
			iterator.enlargeBr = editor.config.enterMode != CKEDITOR.ENTER_BR;
			
			if ( state == CKEDITOR.TRISTATE_OFF )
			{
				var paragraphs = [];
				while ( ( block = iterator.getNextParagraph() ) )
					paragraphs.push( block );
				
				// Make sure all paragraphs have the same parent.
				var commonParent = paragraphs[0].getParent(),
					tmp = [];
				for ( var i = 0 ; i < paragraphs.length ; i++ )
				{
					block = paragraphs[i];
					commonParent = commonParent.getCommonAncestor( block.getParent() );
				}
				
				// Reconstruct the block list to be processed such that all resulting blocks
				// satisfy parentNode.equals( commonParent ).
				var lastBlock = null;
				while ( paragraphs.length > 0 )
				{
					block = paragraphs.shift();
					while ( !block.getParent().equals( commonParent ) )
						block = block.getParent();
					if ( !block.equals( lastBlock ) )
						tmp.push( block );
					lastBlock = block;
				}
				
				// If any of the selected blocks is code, remove them to prevent
				// nested code blocks.
				while ( tmp.length > 0 )
				{
					block = tmp.shift();
					if ( block.getName() == 'code' )
					{
						var docFrag = new CKEDITOR.dom.documentFragment( editor.document );
						while ( block.getFirst() )
						{
							docFrag.append( block.getFirst().remove() );
							paragraphs.push( docFrag.getLast() );
						}
						
						docFrag.replace( block );
					}
					else
						paragraphs.push( block );
				}
				
				// Now we have all the blocks to be included in a new codeblock.
				var codeWrap = editor.document.createElement( 'div' ),
					codeTitle = editor.document.createElement( 'div' ),
					code = editor.document.createElement( 'code' );

				codeWrap.addClass( this.cssClassName );
				codeTitle.addClass( 'title' );

				if ( this.name == 'codetag' )
					codeTitle.setText( lang.codeTitle );
				else if ( this.name == 'phptag' )
					codeTitle.setText( lang.phpTitle );
				
				codeWrap.append( codeTitle );
				codeWrap.insertBefore( paragraphs[0] );
				while ( paragraphs.length > 0 )
				{
					block = paragraphs.shift();
					code.append( block );
				}
				codeWrap.append( code );
			}
			else if ( state == CKEDITOR.TRISTATE_ON )
			{
				var moveOutNodes = [],
					database = {};
				
				while ( ( block = iterator.getNextParagraph() ) )
				{
					var codeParent = null,
						codeChild = null;
					while ( block.getParent() )
					{
						if ( block.getParent().getName() == 'code' )
						{
							codeParent = block.getParent();
							codeChild = block;
							break;
						}
						block = block.getParent();
					}
									
					// Remember the blocks that were recorded down in the moveOutNodes Array
					// to prevent duplicates.
					if ( codeParent && codeChild && !codeChild.getCustomData( 'code_moveout' ) )
					{
						moveOutNodes.push( codeChild );
						CKEDITOR.dom.element.setMarker( database, codeChild, 'code_moveout', true );
					}
				}
				
				CKEDITOR.dom.element.clearAllMarkers( database );
				
				var movedNodes = [],
					processedCodeBlocks = [];
				
				database = {};
				while ( moveOutNodes.length > 0 )
				{
					var node = moveOutNodes.shift();
					code = node.getParent();
					
					// If the node is located at the beginning or the end, just
					// take it out without splitting. Otherwise, split the
					// code layout and move the paragraph in between the two
					// code blocks.
					if ( !node.getPrevious() )
						node.remove().insertBefore( code.getParent() );
					else if ( !node.getNext() )
						node.remove().insertAfter( code.getParent() );
					else
					{
						var codeTitle = editor.document.createElement( 'div' );
						
						codeTitle.addClass( 'title' );
						if ( this.name == 'codetag' )
							codeTitle.setText( 'CODE:' );
						else if ( this.name == 'phptag' )
							codeTitle.setText( 'PHP CODE:' );

						node.breakParent( node.getParent().getParent() );
						processedCodeBlocks.push( node.getNext() );
						processedCodeBlocks[0].append( codeTitle, true );
					}
					
					// Remember the code node so we can clear it later (if it becomes empty).
					if ( !code.getCustomData( 'code_processed' ) )
					{
						processedCodeBlocks.push( code );
						CKEDITOR.dom.element.setMarker( database, code, 'code_processed', true );
					}
					
					movedNodes.push( node );
				}
				
				CKEDITOR.dom.element.clearAllMarkers( database );
				
				// Clear code nodes that have become empty.
				for ( i = processedCodeBlocks.length - 1 ; i >= 0 ; i-- )
				{
					codeBlock = processedCodeBlocks[i];
					if ( noBlockLeft( codeBlock ) )
						codeBlock.getParent().remove();
				}

				if ( editor.config.enterMode == CKEDITOR.ENTER_BR )
				{
					var firstTime = true;
					while ( movedNodes.length )
					{
						node = movedNodes.shift();

						if ( node.getName() == 'div' )
						{
							docFrag = new CKEDITOR.dom.documentFragment( editor.document );
							var needBeginBr = firstTime && node.getPrevious() &&
									!( node.getPrevious().type == CKEDITOR.NODE_ELEMENT && node.getPrevious().isBlockBoundary() );
							if ( needBeginBr )
								docFrag.append( editor.document.createElement( 'br' ) );

							var needEndBr = node.getNext() &&
								!( node.getNext().type == CKEDITOR.NODE_ELEMENT && node.getNext().isBlockBoundary() );
							while ( node.getFirst() )
								node.getFirst().remove().appendTo( docFrag );

							if ( needEndBr )
								docFrag.append( editor.document.createElement( 'br' ) );

							docFrag.replace( node );
							firstTime = false;
						}
					}
				}
			}

			selection.selectBookmarks( bookmarks );
			editor.focus();
		},
			
		refresh : function( path )
		{
			var firstBlock = path.block || path.blockLimit;
			
			this.setState( firstBlock.getName() != 'body' &&
				getCodeType( firstBlock, this.editor.config.useComputedState ) == this.value ?
				CKEDITOR.TRISTATE_ON :
				CKEDITOR.TRISTATE_OFF );
		}
	};

	CKEDITOR.plugins.add( 'mybbcode',
	{
		lang : [ 'en' ],
		init : function( editor )
		{
			var code = new codeCommand( editor, 'codetag', 'code' ),
				php = new codeCommand( editor, 'phptag', 'php' ),
				lang = editor.lang.mybbcode;
			
			editor.addCommand( 'codetag', code );
			editor.addCommand( 'phptag', php );

			editor.ui.addButton( 'Code',
			{
				label : lang.codeButton,
				command : 'codetag',
				icon : this.path + 'images/code.png'
			} );
		
			editor.ui.addButton( 'PHP',
			{
				label : lang.phpButton,
				command : 'phptag',
				icon : this.path + 'images/php.png'
			} );
		
			editor.on( 'selectionChange', CKEDITOR.tools.bind( onSelectionChange, code ) );
			editor.on( 'selectionChange', CKEDITOR.tools.bind( onSelectionChange, php ) );
		},

		requires : [ 'domiterator' ]
	});
})();
