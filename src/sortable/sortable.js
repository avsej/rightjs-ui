/**
 * The Sortable unit
 *
 * Copyright (C) 2009-2010 Nikolay Nemshilov
 */
var Sortable = new Widget('UL', {
  extend: {
    version: '2.0.0',

    EVENTS: $w('change'),

    Options: {
      url:        null,       // the Xhr requests url address, might contain the '%{id}' placeholder
      method:     'put',      // the Xhr requests method

      Xhr:        {},         // additional Xhr options

      idParam:    'id',       // the id value name
      posParam:   'position', // the position value name
      parseId:    true,       // if the id attribute should be converted into an integer before sending

      dragClass:  'dragging', // the in-process class name
      accept:     null,       // a reference or a list of references to the other sortables between which you can drag the items
      minLength:  1,          // minimum number of items on the list when the feature works

      cssRule:    '*[data-sortable]' // css-rule for automatically initializable sortables
    },

    current: false // a reference to the currently active sortable
  },

  /**
   * basic constructor
   *
   * @param mixed element reference
   * @param Object options
   * @return void
   */
  initialize: function(element, options) {
    this.$super('sortable', element)
      .setOptions(options)
      .addClass('rui-sortable')
      .on('change', this._tryXhr)
      .on('selectstart', 'stopEvent'); // disable select under IE
  },

  /**
   * some additional options processing
   *
   * @param Object options
   * @param Element optional context
   * @return Sortable this
   */
  setOptions: function(options, context) {
    this.$super(options, context);

    options = this.options;

    // Preprocessing the acceptance list
    var list = options.accept || [];
    if (!isArray(list)) { list = [list]; }

    options.accept = R([this].concat(list)).map($).uniq();

    return this;
  },

// protected

  // starts the drag
  startDrag: function(event) {
    // don't let to drag out the last item
    if (this.children().length <= this.options.minLength) { return; }

    // trying to find the list-item upon which the user pressed the mouse
    var target = event.target, targets = R([target].concat(target.parents())),
        item = targets[targets.indexOf(this) - 1], event_pos = event.position();

    if (item) {
      this._initDrag(item, event_pos);
      Sortable.current = this;
    }
  },

  // moves the item
  moveItem: function(event) {
    var event_pos = event.position(),
        item   = this.itemClone._.style,
        top    = event_pos.y - this.yRDiff,
        left   = event_pos.x - this.xRDiff,
        right  = left + this.cloneWidth,
        bottom = top  + this.cloneHeight;

    // moving the clone
    item.top  = (event_pos.y - this.yDiff) + 'px';
    item.left = (event_pos.x - this.xDiff) + 'px';

    // checking for an overlaping item
    var over_item = this.suspects.first(function(suspect) {
      return (
        (top    > suspect.top    && top    < suspect.topHalf) ||
        (bottom < suspect.bottom && bottom > suspect.topHalf)
      ) && (
        (left   > suspect.left   && left   < suspect.leftHalf) ||
        (right  < suspect.right  && right  > suspect.leftHalf)
      );
    });

    if (over_item) {
      item = over_item.item;
      item.insert(this.item, item.prevSiblings().include(this.item) ? 'after' : 'before');
      this._findSuspects();

      // sending the event
      var list = item.parent();

      if (!(list instanceof Sortable)) {
        list = new Sortable(list);
      }

      this.fire('change', {
        list:  list,
        item:  this.item,
        index: list.children().indexOf(this.item)
      });
    }
  },

  // finalizes the drag
  finishDrag: function() {
    if (this.itemClone) {
      this.itemClone.remove();
      this.item.setStyle('visibility:visible');
    }
    Sortable.current = false;
  },

  _initDrag: function(item, event_pos) {
    var dims   = this.dimensions(), item_dims = item.dimensions();

    // creating the draggable clone
    var clone = item.clone().setStyle({
      margin:   0,
      zIndex:   9999,
      position: 'absolute',
      top:      '0px',
      left:     '0px'
    })
    .addClass(this.options.dragClass).insertTo(this)
    .setHeight(this.cloneHeight = item_dims.height)
    .setWidth(this.cloneWidth = item_dims.width);

    // adjusting the clone position to compensate relative fields and margins
    var clone_pos = clone.position(),
        real_x    = item_dims.left - clone_pos.x,
        real_y    = item_dims.top  - clone_pos.y;

    clone.moveTo(real_x, real_y);

    this.item = item.setStyle('visibility:hidden');
    this.itemClone = clone;

    // mouse event-position diffs
    this.xDiff  = event_pos.x - real_x;
    this.yDiff  = event_pos.y - real_y;
    this.xRDiff = event_pos.x - clone.position().x;
    this.yRDiff = event_pos.y - clone.position().y;

    // collecting the list of interchangable items with their positions
    this._findSuspects();
  },

  // collects the precached list of suspects
  _findSuspects: function() {
    var suspects = this.suspects = R([]), item = this.item, clone = this.itemClone;
    this.options.accept.each(function(list) {
      list.children().each(function(element) {
        if (element !== item && element !== clone) {
          var dims = element.dimensions();

          // caching the sizes
          suspects.push({
            item:     element,
            top:      dims.top,
            left:     dims.left,
            right:    dims.left + dims.width,
            bottom:   dims.top  + dims.height,
            topHalf:  dims.top  + dims.height/2,
            leftHalf: dims.left + dims.width/2
          });
        }
      });
    });
  },

  // tries to send an Xhr request about the element relocation
  _tryXhr: function(event) {
    if (this.options.url) {
      var url = R(this.options.url), params = {}, item = event.item, position = event.index + 1;

      // building the Xhr request options
      var options = Object.merge({
        method: this.options.method,
        params: {}
      }, this.options.Xhr);

      // grabbing the id
      var id = item.get('id') || '';
      if (this.options.parseId && id) {
        id = (id.match(/\d+/) || [''])[0];
      }

      // assigning the parameters
      if (url.include('%{id}')) {
        url = url.replace('%{id}', id);
      } else {
        params[this.options.idParam] = id;
      }
      params[this.options.posParam] = position;

      // merging the params with possible Xhr params
      if (isString(options.params)) {
        options.params += '&'+Object.toQueryString(params);
      } else {
        options.params = Object.merge(options.params, params);
      }

      // calling the server
      RightJS.Xhr.load(url, options);
    }
  }
});
